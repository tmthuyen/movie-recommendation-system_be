import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
import { IRatingRepository } from './ratings.repository';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { ResultWithPagination } from '@/common/dtos/paginated-result.interface';
import { PaginationUtils } from '@/common/utils/search.util';
import { DataSource } from 'typeorm';
import {
  Interaction,
  InteractionType,
} from '@/modules/interactions/entities/interaction.entity';
import { Rating } from './entities/rating.entity';
import { EventsGateway } from '@/modules/events/events.gateway';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { MovieInteractionStatsService } from '@/modules/interactions/movie-interaction-stats.service';

@Injectable()
export class RatingsService {
  constructor(
    @Inject(IRatingRepository)
    private readonly repo: IRatingRepository,
    private readonly dataSource: DataSource,
    private readonly eventsGateway: EventsGateway,
    private readonly interactionProducer: InteractionProducer,
    private readonly statsService: MovieInteractionStatsService,
  ) {}

  async create(userId: string, createRatingDto: CreateRatingDto) {
    const { movieId, rating } = createRatingDto;

    const { savedRating, isNewRating, previousScore } =
      await this.dataSource.transaction(async manager => {
        const existingRating = await manager.findOne(Rating, {
          where: {
            user: { id: userId },
            movie: { id: movieId },
          },
        });

        let saved: Rating;
        let isNewRating: boolean;
        let previousScore: number;

        if (existingRating) {
          previousScore = Number(existingRating.rating) || 0;
          isNewRating = false;
          existingRating.rating = rating;
          existingRating.timestamp = new Date();
          saved = await manager.save(existingRating);
        } else {
          previousScore = 0;
          isNewRating = true;
          saved = await manager.save(
            manager.create(Rating, {
              rating,
              movie: { id: movieId } as any,
              user: { id: userId } as any,
              timestamp: new Date(),
            }),
          );
        }

        // Upsert Interaction — score = đúng số sao người dùng nhập (band 5)
        const interaction = await manager.findOne(Interaction, {
          where: {
            user: { id: userId },
            movie: { id: movieId },
            type: InteractionType.RATING,
          },
        });
        if (interaction) {
          interaction.score = rating;
          await manager.save(interaction);
        } else {
          await manager.save(
            manager.create(Interaction, {
              score: rating,
              type: InteractionType.RATING,
              movie: { id: movieId } as any,
              user: { id: userId } as any,
            }),
          );
        }

        return { savedRating: saved, isNewRating, previousScore };
      });

    const stats = await this.statsService.recordRating(
      movieId,
      isNewRating ? 1 : 0,
      Number(rating) - previousScore,
    );

    this.eventsGateway.broadcastRating(movieId, {
      ...savedRating,
      movieStats: {
        voteCount: stats.ratingCount,
        voteAverage: stats.ratingAvg,
      },
    });

    await this.interactionProducer.publishInteractionCreated({
      userId,
      movieId,
      action: InteractionType.RATING,
      score: rating,
      removed: false,
      createdAt: savedRating.createdAt ?? new Date(),
    });

    return savedRating;
  }

  async findAll(
    request: BaseSearchRequest,
  ): Promise<ResultWithPagination<Rating>> {
    const page = Math.max(request.page ?? 1, 1);
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);

    const [data, total] = await this.repo.findAll({
      ...request,
      page,
      limit,
    });

    return {
      result: data,
      pagination: PaginationUtils.getPaginationMeta(page, limit, total),
    };
  }

  async findByMovie(
    movieId: number,
    request: BaseSearchRequest,
  ): Promise<ResultWithPagination<Rating>> {
    const page = Math.max(request.page ?? 1, 1);
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);

    const [data, total] = await this.repo.findByMovie(movieId, {
      ...request,
      page,
      limit,
    });

    return {
      result: data,
      pagination: PaginationUtils.getPaginationMeta(page, limit, total),
    };
  }

  async findOne(id: number) {
    const rating = await this.repo.findById(id);
    if (!rating) {
      throw new NotFoundException(`Rating with ID ${id} not found`);
    }
    return rating;
  }

  async update(id: number, updateRatingDto: UpdateRatingDto) {
    const rating = await this.findOne(id);
    return this.repo.update(rating.id, updateRatingDto);
  }

  async remove(id: number) {
    const rating = await this.findOne(id);
    await this.repo.remove(rating.id);
    return { success: true };
  }

  async findByUserAndMovie(
    userId: string,
    movieId: number,
  ): Promise<Rating | null> {
    const rating = await this.repo.findByUserAndMovie(userId, movieId);
    return rating;
  }
}
