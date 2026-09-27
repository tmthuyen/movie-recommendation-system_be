import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { UpdateInteractionDto } from './dto/update-interaction.dto';
import { IInteractionRepository } from './interactions.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';

@Injectable()
export class InteractionsService {
  constructor(
    @Inject(IInteractionRepository)
    private readonly repo: IInteractionRepository,
  ) {}

  async create(userId: string, createInteractionDto: CreateInteractionDto) {
    const { movieId, score, type } = createInteractionDto;
    return this.repo.create({
      score,
      type,
      movie: { id: movieId } as any,
      user: { id: userId } as any,
    });
  }

  async findAll(paginationDto: PaginationDto) {
    return this.repo.findAll(paginationDto);
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
