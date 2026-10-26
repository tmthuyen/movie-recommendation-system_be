import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { IInteractionRepository } from './interactions.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import {
  Interaction,
  InteractionScoreMap,
  InteractionType,
} from './entities/interaction.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { User } from '@/modules/users/entities/user.entity';
import { EventsGateway } from '@/modules/events/events.gateway';
import {
  MovieInteractionStats,
  MovieInteractionStatsService,
} from './movie-interaction-stats.service';

export interface ToggleInteractionResult {
  action: 'added' | 'removed';
  type: InteractionType;
  /** Score của tương tác vừa tạo (0 khi huỷ). */
  score: number;
  likeCount: number;
  data?: Interaction;
}

@Injectable()
export class InteractionsService {
  constructor(
    @Inject(IInteractionRepository)
    private readonly repo: IInteractionRepository,
    private readonly interactionProducer: InteractionProducer,
    private readonly statsService: MovieInteractionStatsService,
    private readonly eventsGateway: EventsGateway,
  ) {}

  /**
   * TOGGLE like: gọi lần 1 để thích, gọi lại để bỏ thích.
   * Backend tự tính `score` (band 5) — client không gửi score.
   */
  async create(
    userId: string,
    createInteractionDto: CreateInteractionDto,
  ): Promise<ToggleInteractionResult> {
    const { movieId, type } = createInteractionDto;

    // Đảm bảo phim tồn tại (404 thay vì lỗi FK 500)
    await this.statsService.getStats(movieId);

    const existing = await this.repo.findByUnique(userId, movieId, type);

    if (existing) {
      await this.repo.remove(existing.id);
      const stats = await this.statsService.getStats(movieId);
      const removedScore = -InteractionScoreMap[type];

      this.publishAndBroadcast(
        userId,
        movieId,
        type,
        'removed',
        removedScore,
        stats,
      );

      return {
        action: 'removed',
        type,
        score: 0,
        likeCount: stats.likeCount,
      };
    }

    const score = InteractionScoreMap[type] ?? 0;
    const newInteraction = await this.repo.create({
      score,
      type,
      movie: { id: movieId } as Movie,
      user: { id: userId } as User,
    });

    const stats = await this.statsService.getStats(movieId);
    this.publishAndBroadcast(userId, movieId, type, 'added', score, stats);

    return {
      action: 'added',
      type,
      score,
      likeCount: stats.likeCount,
      data: newInteraction,
    };
  }

  /** Số liệu tương tác realtime của phim (like/comment/view/rating). */
  async getMovieStats(movieId: number): Promise<MovieInteractionStats> {
    return this.statsService.getStats(movieId);
  }

  async findAll(paginationDto: PaginationDto) {
    return this.repo.findAll(paginationDto);
  }

  async getHistory(userId: string, paginationDto: PaginationDto) {
    // Only fetch CLICK (view history)
    return this.repo.findByUser(userId, paginationDto, [InteractionType.CLICK]);
  }

  async getFavorites(userId: string, paginationDto: PaginationDto) {
    return this.repo.findByUser(userId, paginationDto, [InteractionType.LIKE]);
  }

  async findOne(id: number) {
    const item = await this.repo.findById(id);
    if (!item) {
      throw new NotFoundException(`Không tìm thấy tương tác với ID ${id}`);
    }
    return item;
  }

  async remove(id: number) {
    const item = await this.findOne(id);
    await this.repo.remove(item.id);
    return { success: true };
  }

  async toggleLike({
    userId,
    movieId,
  }: {
    userId: string;
    movieId: number;
  }): Promise<ToggleInteractionResult> {
    return this.create(userId, {
      type: InteractionType.LIKE,
      movieId,
    });
  }

  private publishAndBroadcast(
    userId: string,
    movieId: number,
    type: InteractionType,
    action: 'added' | 'removed',
    score: number,
    stats: MovieInteractionStats,
  ) {
    const createdAt = new Date();

    this.eventsGateway.broadcastInteraction({
      movieId,
      type,
      action,
      score,
      likeCount: stats.likeCount,
      commentCount: stats.commentCount,
      viewCount: stats.viewCount,
    });

    this.interactionProducer.publishInteractionCreated({
      userId,
      movieId,
      action: type,
      score,
      removed: action === 'removed',
      createdAt,
    });
  }
}
