import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { People } from './entities/people.entity';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';
import { SearchUtils } from '@/common/utils/search.util';

export const IPeopleRepository = Symbol('IPeopleRepository');

export interface IPeopleRepository {
  findAll(request: BaseSearchRequest): Promise<PaginatedResult<People>>;
  findById(id: number): Promise<People | null>;
  create(people: Partial<People>): Promise<People>;
  update(id: number, people: Partial<People>): Promise<People | null>;
  remove(id: number): Promise<boolean>;
}

const PEOPLE_FIELD_MAP: Record<string, string> = {
  id: 'people.id',
  fullName: 'people.fullName',
  nationality: 'people.nationality',
  gender: 'people.gender',
  mainRole: 'people.mainRole',
  birthDate: 'people.birthDate',
  createdAt: 'people.createdAt',
  updatedAt: 'people.updatedAt',
};

@Injectable()
export class PeopleRepository implements IPeopleRepository {
  constructor(
    @InjectRepository(People)
    private readonly repo: Repository<People>,
  ) {}

  async findAll(request: BaseSearchRequest): Promise<PaginatedResult<People>> {
    const { page = 1, limit = 10, keyword, filters = [], sort } = request;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo.createQueryBuilder('people');

    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      queryBuilder.andWhere(
        '(people.fullName ILIKE :keyword OR people.nationality ILIKE :keyword)',
        { keyword: `%${trimmedKeyword}%` },
      );
    }

    SearchUtils.applyFilters(queryBuilder, filters || [], PEOPLE_FIELD_MAP);

    const sortOptions = SearchUtils.parseSort(
      sort?.join(',') ?? 'createdAt:DESC',
      Object.keys(PEOPLE_FIELD_MAP),
    );

    for (const option of sortOptions) {
      const column = PEOPLE_FIELD_MAP[option.field];
      if (!column) {
        throw new BadRequestException(
          `Sort field không hợp lệ: ${option.field}`,
        );
      }
      queryBuilder.addOrderBy(column, option.direction);
    }

    if (!sortOptions.some(option => option.field === 'id')) {
      queryBuilder.addOrderBy('people.id', 'ASC');
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

  async findById(id: number): Promise<People | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(people: Partial<People>): Promise<People> {
    const newPeople = this.repo.create(people);
    return this.repo.save(newPeople);
  }

  async update(id: number, people: Partial<People>): Promise<People | null> {
    await this.repo.update(id, people);
    return this.findById(id);
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return Boolean(result.affected && result.affected > 0);
  }
}
