import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Genre } from './entities/genre.entity';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';
import { SearchUtils } from '@/common/utils/search.util';

export const IGenreRepository = Symbol('IGenreRepository');

export interface IGenreRepository {
  findAll(request: BaseSearchRequest): Promise<PaginatedResult<Genre>>;
  findById(id: number): Promise<Genre | null>;
  findByNameOrEnName(name: string, enName?: string): Promise<Genre | null>;
  create(genre: Partial<Genre>): Promise<Genre>;
  update(id: number, genre: Partial<Genre>): Promise<Genre | null>;
  remove(id: number): Promise<boolean>;
}

const GENRE_FIELD_MAP: Record<string, string> = {
  id: 'genre.id',
  name: 'genre.name',
  enName: 'genre.enName',
  createdAt: 'genre.createdAt',
  updatedAt: 'genre.updatedAt',
};

@Injectable()
export class GenreRepository implements IGenreRepository {
  constructor(
    @InjectRepository(Genre)
    private readonly repo: Repository<Genre>,
  ) {}

  async findAll(request: BaseSearchRequest): Promise<PaginatedResult<Genre>> {
    const { page = 1, limit = 10, keyword, filters = [], sort } = request;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo.createQueryBuilder('genre');

    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      queryBuilder.andWhere(
        '(genre.name ILIKE :keyword OR genre.enName ILIKE :keyword)',
        { keyword: `%${trimmedKeyword}%` },
      );
    }

    SearchUtils.applyFilters(queryBuilder, filters || [], GENRE_FIELD_MAP);

    const sortOptions = SearchUtils.parseSort(
      sort?.join(',') ?? 'createdAt:DESC',
      Object.keys(GENRE_FIELD_MAP),
    );

    for (const option of sortOptions) {
      const column = GENRE_FIELD_MAP[option.field];
      if (!column) {
        throw new BadRequestException(
          `Sort field không hợp lệ: ${option.field}`,
        );
      }
      queryBuilder.addOrderBy(column, option.direction);
    }

    if (!sortOptions.some(option => option.field === 'id')) {
      queryBuilder.addOrderBy('genre.id', 'ASC');
    }

    queryBuilder.skip(skip).take(limit);

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

  async findByNameOrEnName(
    name: string,
    enName?: string,
  ): Promise<Genre | null> {
    const where = enName
      ? [{ name }, { enName }, { name: enName }, { enName: name }]
      : [{ name }];
    return this.repo.findOne({ where });
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
