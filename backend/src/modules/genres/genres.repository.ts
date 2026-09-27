import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genre } from './entities/genre.entity';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';

export const IGenreRepository = Symbol('IGenreRepository');

export interface IGenreRepository {
  findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Genre>>;
  findById(id: number): Promise<Genre | null>;
  create(genre: Partial<Genre>): Promise<Genre>;
  update(id: number, genre: Partial<Genre>): Promise<Genre | null>;
  remove(id: number): Promise<boolean>;
}

@Injectable()
export class GenreRepository implements IGenreRepository {
  constructor(
    @InjectRepository(Genre)
    private readonly repo: Repository<Genre>,
  ) {}

  async findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Genre>> {
    const { page = 1, limit = 10, keyword } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo.createQueryBuilder('genre');

    if (keyword) {
      queryBuilder.where('genre.name ILIKE :keyword', {
        keyword: `%${keyword}%`,
      });
    }

    queryBuilder.skip(skip).take(limit).orderBy('genre.createdAt', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number): Promise<Genre | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(genre: Partial<Genre>): Promise<Genre> {
    const newGenre = this.repo.create(genre);
    return this.repo.save(newGenre);
  }

  async update(id: number, genre: Partial<Genre>): Promise<Genre | null> {
    await this.repo.update(id, genre);
    return this.findById(id);
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return Boolean(result.affected && result.affected > 0);
  }
}
