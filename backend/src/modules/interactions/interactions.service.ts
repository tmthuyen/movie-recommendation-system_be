import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import {
  CreateInteractionDto,
  InteractionGenreDto,
} from './dto/create-interaction.dto';
import { IInteractionRepository } from './interactions.repository';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { PaginationUtils } from '@/common/utils/search.util';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import {
  Interaction,
  InteractionScoreMap,
  InteractionType,
} from './entities/interaction.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { User } from '@/modules/users/entities/user.entity';
import { EventsGateway } from '@/modules/events/events.gateway';
import {
  HotMovie,
  MovieInteractionStats,
  MovieInteractionStatsService,
  StatsMetric,
  StatsPeriod,
} from './movie-interaction-stats.service';
import { MoviesService } from '@/modules/movies/movies.service';
import { ResultWithPagination } from '@/common/dtos/paginated-result.interface';
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
    private readonly userProducer: UserProducer,
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
    const { movieId, type, genres } = createInteractionDto;

    this.logger.log(
      `Xử lý tương tác userId=${userId}, movieId=${movieId}, type=${type}`,
    );

    const { action, data } = await this.dataSource.transaction(
      async manager => {
        const movie = await manager.findOne(Movie, { where: { id: movieId } });
        if (!movie) {
          this.logger.error(`Không tìm thấy phim với ID ${movieId}`);
          throw new NotFoundException(`Không tìm thấy phim với ID ${movieId}`);
        }

        const existing = await manager.findOne(Interaction, {
          where: {
            user: { id: userId },
            movie: { id: movieId },
            type,
          },
        });

        if (existing) {
          await manager.remove(existing);
          this.logger.log(
            `Xóa tương tác userId=${userId}, movieId=${movieId}, type=${type}`,
          );
          return { action: 'removed' as const, data: null };
        }

        const newInteraction = manager.create(Interaction, {
          type,
          movie: { id: movieId } as Movie,
          user: { id: userId } as User,
        });
        await manager.save(newInteraction);
        this.logger.log(
          `Tạo tương tác mới userId=${userId}, movieId=${movieId}, type=${type}`,
        );
        return { action: 'added' as const, data: newInteraction };
      },
    );

    const stats =
      type === InteractionType.LIKE
        ? await this.statsService.recordLike(
            movieId,
            action === 'added' ? 1 : -1,
          )
        : await this.statsService.getStats(movieId);
    await this.publishAndBroadcast(
      userId,
      movieId,
      type,
      action,
      stats,
      genres,
    );

    return {
      action,
      type,
      likeCount: stats.likeCount,
      data: data || undefined,
    };
  }

  /** Số liệu tương tác realtime của phim (like/comment/view/rating). */
  async getMovieStats(movieId: number): Promise<MovieInteractionStats> {
    return this.statsService.getStats(movieId);
  }

  /** Trả danh sách xếp hạng phim từ Redis. */
  async getMovieRanking(
    type: 'popular' | 'hot' | 'top',
    metricOrPeriod: StatsMetric | StatsPeriod,
    period: StatsPeriod,
    limit: number,
  ): Promise<HotMovie[]> {
    return this.statsService.getRanking(type, metricOrPeriod, period, limit);
  }

  async findAll(
    request: BaseSearchRequest,
  ): Promise<ResultWithPagination<Interaction>> {
    const page = Math.max(request.page ?? 1, 1);
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);

    const [data, total] = await this.repo.findAll({
      ...request,
      page,
      limit,
    });

    this.logger.log(
      `Lấy danh sách tương tác: page=${page}, limit=${limit}, keyword=${request.keyword || 'N/A'}`,
    );

    return {
      result: data,
      pagination: PaginationUtils.getPaginationMeta(page, limit, total),
    };
  }

  async getHistory(
    userId: string,
    request: BaseSearchRequest,
  ): Promise<ResultWithPagination<Interaction>> {
    const page = Math.max(request.page ?? 1, 1);
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);

    // Only fetch CLICK (view history)
    const [data, total] = await this.repo.findByUser(
      userId,
      { ...request, page, limit },
      [InteractionType.CLICK],
    );

    this.logger.log(
      `Lấy lịch sử xem phim của userId=${userId}: page=${page}, limit=${limit}`,
    );

    return {
      result: data,
      pagination: PaginationUtils.getPaginationMeta(page, limit, total),
    };
  }

  async getFavorites(
    userId: string,
    request: BaseSearchRequest,
  ): Promise<ResultWithPagination<Interaction>> {
    const page = Math.max(request.page ?? 1, 1);
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);

    const [data, total] = await this.repo.findByUser(
      userId,
      { ...request, page, limit },
      [InteractionType.LIKE],
    );

    this.logger.log(
      `Lấy danh sách yêu thích của userId=${userId}: page=${page}, limit=${limit}`,
    );

    return {
      result: data,
      pagination: PaginationUtils.getPaginationMeta(page, limit, total),
    };
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

  /**
   * Broadcast realtime và publish các event sinh ra từ một tương tác.
   * `interaction.created` giữ nguyên; genre được phát riêng bằng `user.genre.update` khi có genres từ frontend.
   * @returns Promise<void>; không ghi thêm DB/Redis, chỉ đẩy socket và RabbitMQ.
   */
  private async publishAndBroadcast(
    userId: string,
    movieId: number,
    type: InteractionType,
    action: 'added' | 'removed',
    stats: MovieInteractionStats,
    genres?: InteractionGenreDto[],
  ): Promise<void> {
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

      if (genres && genres.length > 0) {
        await this.userProducer.publishUserGenreUpdate(
          {
            type,
            genres: genres.map(genre => ({ id: genre.id, name: genre.name })),
            score: InteractionScoreMap[type],
          },
          undefined,
          userId,
        );
        this.logger.log(
          `Đã publish user.genre.update: userId=${userId}, genres=${genres.length}`,
        );
      }
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
