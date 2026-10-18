import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { IInteractionRepository } from './interactions.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import {
  InteractionScoreMap,
  InteractionType,
} from './entities/interaction.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { User } from '@/modules/users/entities/user.entity';

@Injectable()
export class InteractionsService {
  constructor(
    @Inject(IInteractionRepository)
    private readonly repo: IInteractionRepository,
    private readonly interactionProducer: InteractionProducer,
  ) {}

  async create(userId: string, createInteractionDto: CreateInteractionDto) {
    const { movieId, type } = createInteractionDto;

    // Check if interaction already exists
    const existing = await this.repo.findByUnique(userId, movieId, type);

    if (existing) {
      // Toggle off (remove)
      await this.repo.remove(existing.id);
      return { success: true, action: 'removed', type };
    }

    // Toggle on (create)
    const score = InteractionScoreMap[type] || 0;

    const newInteraction = await this.repo.create({
      score,
      type,
      movie: { id: movieId } as Movie,
      user: { id: userId } as User,
    });

    this.interactionProducer.publishInteractionCreated({
      userId,
      movieId,
      action: type.toLowerCase(),
      score: score,
      createdAt: newInteraction.createdAt,
    });

    return { success: true, action: 'added', type, data: newInteraction };
  }

  async findAll(paginationDto: PaginationDto) {
    return this.repo.findAll(paginationDto);
  }

  async getHistory(userId: string, paginationDto: PaginationDto) {
    // Only fetch CLICK (view history)
    return this.repo.findByUser(userId, paginationDto, [InteractionType.CLICK]);
  }

  async getFavorites(userId: string, paginationDto: PaginationDto) {
    // Fetch LIKE, FAVORITE, WATCHLIST
    return this.repo.findByUser(userId, paginationDto, [
      InteractionType.LIKE,
      InteractionType.FAVORITE,
      InteractionType.WATCHLIST,
    ]);
  }

  async findOne(id: number) {
    const item = await this.repo.findById(id);
    if (!item) {
      throw new NotFoundException(`Interaction with ID ${id} not found`);
    }
    return item;
  }

  async remove(id: number) {
    const item = await this.findOne(id);
    await this.repo.remove(item.id);
    return { success: true };
  }
}
