import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { IInteractionRepository } from './interactions.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { Interaction, InteractionType } from './entities/interaction.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { User } from '@/modules/users/entities/user.entity';
import { EventsGateway } from '@/modules/events/events.gateway';
import {
  MovieInteractionStats,
  MovieInteractionStatsService,
} from './movie-interaction-stats.service';
import { MoviesService } from '@/modules/movies/movies.service';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';
import { RatingsService } from '@/modules/ratings/ratings.service';
import { Rating } from '@/modules/ratings/entities/rating.entity';
import { MyInteractionsWithMovie } from '@/modules/interactions/dto/my-interaction-with-movie.dto';
import { DataSource } from 'typeorm';

export interface ToggleInteractionResult {
  action: string; // 'added' | 'removed'
  type: InteractionType;
  likeCount: number;
  data?: Interaction;
}

@Injectable()
export class InteractionsService {
  private readonly logger = new Logger(InteractionsService.name);
  constructor(
    @Inject(IInteractionRepository)
    private readonly repo: IInteractionRepository,
    private readonly interactionProducer: InteractionProducer,
    private readonly statsService: MovieInteractionStatsService,
    private readonly eventsGateway: EventsGateway,
    private readonly dataSource: DataSource,
    private readonly ratingService: RatingsService,
  ) {}

  /**
   * TOGGLE like: gọi lần 1 để thích, gọi lại để bỏ thích.
   */
  async create(
    userId: string,
    createInteractionDto: CreateInteractionDto,
  ): Promise<ToggleInteractionResult> {
    const { movieId, type } = createInteractionDto;

    this.logger.log(
      `Xử lý tương tác userId=${userId}, movieId=${movieId}, type=${type}`,
    );

    const { action, likeCount, data } = await this.dataSource.transaction(
      async manager => {
        // check if the movie exists
        const movie = await manager.findOne(Movie, { where: { id: movieId } });
        if (!movie) {
          this.logger.error(`Không tìm thấy phim với ID ${movieId}`);
          throw new NotFoundException(`Không tìm thấy phim với ID ${movieId}`);
        }
        const oldLikeCount = movie.likeCount || 0;

        this.logger.log(
          `Xử lý tương tác userId=${userId}, movieId=${movieId}, type=${type}, oldLikeCount=${oldLikeCount}`,
        );

        // Check existing interaction for toggle
        const existing = await manager.findOne(Interaction, {
          where: {
            user: { id: userId },
            movie: { id: movieId },
            type,
          },
        });

        // Nếu đã tồn tại, xóa interaction và trả về action = 'removed'
        if (existing) {
          await manager.remove(existing);
          this.logger.log(
            `Xóa tương tác userId=${userId}, movieId=${movieId}, type=${type}`,
          );

          // Cập nhật lại likeCount trong bảng movies
          if (type === InteractionType.LIKE) {
            // Atomic Update
            await manager.decrement(Movie, { id: movieId }, 'likeCount', 1);
            this.logger.log(
              `Cập nhật likeCount trong bảng movies: movieId=${movieId}, oldLikeCount=${oldLikeCount}`,
            );
          }

          const stats = await this.statsService.getStats(movieId, manager);

          this.publishAndBroadcast(userId, movieId, type, 'removed', stats);

          return {
            action: 'removed',
            likeCount: stats.likeCount,
            data: null,
          };
        }

        // Nếu chưa tồn tại, tạo interaction và trả về action = 'added'
        const newInteraction = manager.create(Interaction, {
          type,
          movie: { id: movieId } as Movie,
          user: { id: userId } as User,
        });
        await manager.save(newInteraction);

        // Cập nhật lại likeCount trong bảng movies
        if (type === InteractionType.LIKE) {
          // Atomic Update
          await manager.increment(Movie, { id: movieId }, 'likeCount', 1);

          this.logger.log(
            `Cập nhật likeCount trong bảng movies: movieId=${movieId}, oldLikeCount=${oldLikeCount}`,
          );
        }

        this.logger.log(
          `Tạo tương tác mới userId=${userId}, movieId=${movieId}, type=${type}`,
        );

        const stats = await this.statsService.getStats(movieId, manager);

        this.publishAndBroadcast(userId, movieId, type, 'added', stats);

        return {
          action: 'added',
          likeCount: stats.likeCount,
          data: newInteraction,
        };
      },
    );
    return {
      action,
      type,
      likeCount: likeCount,
      data: data || undefined,
    };
  }

  /** Số liệu tương tác realtime của phim (like/comment/view/rating). */
  async getMovieStats(movieId: number): Promise<MovieInteractionStats> {
    return this.statsService.getStats(movieId);
  }

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Interaction>> {
    const data = await this.repo.findAll(paginationDto);

    this.logger.log(
      `Lấy danh sách tương tác: page=${paginationDto.page}, limit=${paginationDto.limit}, keyword=${paginationDto.keyword || 'N/A'}`,
    );
    return data;
  }

  async getHistory(userId: string, paginationDto: PaginationDto) {
    // Only fetch CLICK (view history)
    const data = await this.repo.findByUser(userId, paginationDto, [
      InteractionType.CLICK,
    ]);

    this.logger.log(
      `Lấy lịch sử xem phim của userId=${userId}: page=${paginationDto.page}, limit=${paginationDto.limit}`,
    );
    return data;
  }

  async getFavorites(userId: string, paginationDto: PaginationDto) {
    const data = await this.repo.findByUser(userId, paginationDto, [
      InteractionType.LIKE,
    ]);
    this.logger.log(
      `Lấy danh sách yêu thích của userId=${userId}: page=${paginationDto.page}, limit=${paginationDto.limit}`,
    );
    return data;
  }

  async findOne(id: number) {
    const item = await this.repo.findById(id);
    if (!item) {
      throw new NotFoundException(`Không tìm thấy tương tác với ID ${id}`);
    }
    this.logger.log(`Lấy tương tác với ID ${id} thành công`);
    return item;
  }

  async remove(id: number) {
    const item = await this.findOne(id);
    await this.repo.remove(item.id);
    this.logger.log(`Xóa tương tác với ID ${id} thành công`);
    return { success: true };
  }

  private async publishAndBroadcast(
    userId: string,
    movieId: number,
    type: InteractionType,
    action: 'added' | 'removed',
    stats: MovieInteractionStats,
  ) {
    this.logger.log(
      'Đang broadcast và publish sự kiện tương tác:',
      JSON.stringify({ userId, movieId, type, action, stats }),
    );

    const createdAt = new Date();

    this.eventsGateway.broadcastInteraction({
      movieId,
      type,
      action,
      score: null,
      likeCount: stats.likeCount,
      commentCount: stats.commentCount,
      viewCount: stats.viewCount,
    });
    this.logger.log(
      `Đã broadcast sự kiện tương tác: userId=${userId}, movieId=${movieId}, type=${type}, action=${action}`,
    );

    // Nếu remove khỏi publish queue
    if (action !== 'removed') {
      await this.interactionProducer.publishInteractionCreated({
        userId,
        movieId,
        action: type,
        score: null,
        removed: false,
        createdAt,
      });
      this.logger.log(
        `Đã publish queue sự kiện tương tác: userId=${userId}, movieId=${movieId}, type=${type}, action=${action}`,
      );
    }
  }

  async getInteractionsByUserAndMovie(
    userId: string,
    movieId: number,
  ): Promise<MyInteractionsWithMovie> {
    const [interactions, rating] = await Promise.all([
      this.repo.findAllByUserAndMovie(userId, movieId),
      this.ratingService.findByUserAndMovie(userId, movieId),
    ]);
    // get comment

    const isLiked = interactions.some(i => i.type === InteractionType.LIKE);
    const click = interactions.some(i => i.type === InteractionType.CLICK);
    const commentCount = interactions.filter(
      i => i.type === InteractionType.COMMENT,
    ).length;

    return {
      isLiked,
      click,
      commentCount,
      rating,
    };
  }
}
