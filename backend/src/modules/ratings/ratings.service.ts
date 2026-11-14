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
import { Movie } from '@/modules/movies/entities/movie.entity';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';

@Injectable()
export class RatingsService {
  constructor(
    @Inject(IRatingRepository)
    private readonly repo: IRatingRepository,
    private readonly dataSource: DataSource,
    private readonly eventsGateway: EventsGateway,
    private readonly interactionProducer: InteractionProducer,
  ) {}

  async create(userId: string, createRatingDto: CreateRatingDto) {
    const { movieId, rating } = createRatingDto;

    const { savedRating, voteCount, voteAverage } =
      await this.dataSource.transaction(async manager => {
        // Check existing rating for upsert
        const existingRating = await manager.findOne(Rating, {
          where: {
            user: { id: userId },
            movie: { id: movieId },
          },
        });

        let saved: Rating;
        if (existingRating) {
          existingRating.rating = rating;
          existingRating.timestamp = new Date();
          saved = await manager.save(existingRating);
        } else {
          // Create Rating
          const newRating = manager.create(Rating, {
            rating,
            movie: { id: movieId } as any,
            user: { id: userId } as any,
            timestamp: new Date(),
          });
          saved = await manager.save(newRating);
        }

        // Upsert Interaction — score = đúng số sao người dùng nhập (band 5)
        let interaction = await manager.findOne(Interaction, {
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
          interaction = manager.create(Interaction, {
            score: rating,
            type: InteractionType.RATING,
            movie: { id: movieId } as any,
            user: { id: userId } as any,
          });
          await manager.save(interaction);
        }

        // Recalculate average and count for the movie
        const result = await manager
          .createQueryBuilder(Rating, 'rating')
          .select('COUNT(rating.id)', 'count')
          .addSelect('AVG(rating.rating)', 'average')
          .where('rating.movie_id = :movieId', { movieId })
          .getRawOne();

        const count = parseInt(result.count || '0', 10);
        const average = parseFloat(
          parseFloat(result.average || '0').toFixed(2),
        );

        await manager.update(Movie, movieId, {
          voteCount: count,
          voteAverage: average,
        });

        return {
          savedRating: saved,
          voteCount: count,
          voteAverage: average,
        };
      });

    // Chỉ broadcast/publish SAU khi transaction commit.
    this.eventsGateway.broadcastRating(movieId, {
      ...savedRating,
      movieStats: { voteCount, voteAverage },
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
