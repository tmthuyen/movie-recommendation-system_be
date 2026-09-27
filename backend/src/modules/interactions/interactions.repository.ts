import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interaction } from './entities/interaction.entity';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';

export const IInteractionRepository = Symbol('IInteractionRepository');

export interface IInteractionRepository {
  findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Interaction>>;
  findByUser(
    userId: string,
    paginationDto: PaginationDto,
    types?: string[],
  ): Promise<PaginatedResult<Interaction>>;
  findById(id: number): Promise<Interaction | null>;
  create(interaction: Partial<Interaction>): Promise<Interaction>;
  update(
    id: number,
    interaction: Partial<Interaction>,
  ): Promise<Interaction | null>;
  remove(id: number): Promise<boolean>;
  findByUnique(
    userId: string,
    movieId: number,
    type: string,
  ): Promise<Interaction | null>;
}

@Injectable()
export class InteractionRepository implements IInteractionRepository {
  constructor(
    @InjectRepository(Interaction)
    private readonly repo: Repository<Interaction>,
  ) {}

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Interaction>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('interaction')
      .leftJoinAndSelect('interaction.user', 'user')
      .leftJoinAndSelect('interaction.movie', 'movie')
      .skip(skip)
      .take(limit)
      .orderBy('interaction.id', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByUser(
    userId: string,
    paginationDto: PaginationDto,
    types?: string[],
  ): Promise<PaginatedResult<Interaction>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('interaction')
      .leftJoinAndSelect('interaction.movie', 'movie')
      .where('interaction.user_id = :userId', { userId });

    if (types && types.length > 0) {
      queryBuilder.andWhere('interaction.type IN (:...types)', { types });
    }

    queryBuilder.skip(skip).take(limit).orderBy('interaction.id', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number): Promise<Interaction | null> {
    return this.repo
      .createQueryBuilder('interaction')
      .leftJoinAndSelect('interaction.user', 'user')
      .leftJoinAndSelect('interaction.movie', 'movie')
      .where('interaction.id = :id', { id })
      .getOne();
  }

  async create(interaction: Partial<Interaction>): Promise<Interaction> {
    const newInteraction = this.repo.create(interaction);
    return this.repo.save(newInteraction);
  }

  async update(
    id: number,
    interaction: Partial<Interaction>,
  ): Promise<Interaction | null> {
    await this.repo.update(id, interaction);
    return this.findById(id);
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return Boolean(result.affected && result.affected > 0);
  }

  async findByUnique(
    userId: string,
    movieId: number,
    type: string,
  ): Promise<Interaction | null> {
    return this.repo.findOne({
      where: {
        user: { id: userId } as any,
        movie: { id: movieId } as any,
        type: type as any,
      },
    });
  }
}
