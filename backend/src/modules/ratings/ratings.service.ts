import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
import { IRatingRepository } from './ratings.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { DataSource } from 'typeorm';
import {
  Interaction,
  InteractionType,
} from '@/modules/interactions/entities/interaction.entity';
import { Rating } from './entities/rating.entity';
import { EventsGateway } from '@/modules/events/events.gateway';

@Injectable()
export class RatingsService {
  constructor(
    @Inject(IRatingRepository)
    private readonly repo: IRatingRepository,
    private readonly dataSource: DataSource,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(userId: string, createRatingDto: CreateRatingDto) {
    const { movieId, rating } = createRatingDto;

    return await this.dataSource.transaction(async manager => {
      // Create Rating
      const newRating = manager.create(Rating, {
        rating,
        movie: { id: movieId } as any,
        user: { id: userId } as any,
        timestamp: new Date(),
      });
      const savedRating = await manager.save(newRating);

      // Create Interaction
      const interaction = manager.create(Interaction, {
        score: rating,
        type: InteractionType.RATING,
        movie: { id: movieId } as any,
        user: { id: userId } as any,
      });
      await manager.save(interaction);

      this.eventsGateway.broadcastRating(movieId, savedRating);

      return savedRating;
    });
  }

  async findAll(paginationDto: PaginationDto) {
    return this.repo.findAll(paginationDto);
  }

  async findByMovie(movieId: number, paginationDto: PaginationDto) {
    return this.repo.findByMovie(movieId, paginationDto);
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
}
