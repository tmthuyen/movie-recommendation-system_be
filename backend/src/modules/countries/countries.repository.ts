import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Country } from './entities/country.entity';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';
import { SearchUtils } from '@/common/utils/search.util';

export const ICountryRepository = Symbol('ICountryRepository');

export interface ICountryRepository {
  findAll(request: BaseSearchRequest): Promise<PaginatedResult<Country>>;
  findById(id: number): Promise<Country | null>;
  findByCode(code: string): Promise<Country | null>;
  create(country: Partial<Country>): Promise<Country>;
  update(id: number, country: Partial<Country>): Promise<Country | null>;
  remove(id: number): Promise<boolean>;
  findByNameOrCode(
    viName: string,
    enName: string,
    code: string,
  ): Promise<Country | null>;
}

const COUNTRY_FIELD_MAP: Record<string, string> = {
  id: 'country.id',
  viName: 'country.viName',
  enName: 'country.enName',
  code: 'country.code',
  region: 'country.region',
  subregion: 'country.subregion',
  createdAt: 'country.createdAt',
  updatedAt: 'country.updatedAt',
};

@Injectable()
export class CountryRepository implements ICountryRepository {
  constructor(
    @InjectRepository(Country)
    private readonly repo: Repository<Country>,
  ) {}

  async findAll(request: BaseSearchRequest): Promise<PaginatedResult<Country>> {
    const { page = 1, limit = 10, keyword, filters = [], sort } = request;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo.createQueryBuilder('country');

    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      queryBuilder.andWhere(
        '(country.viName ILIKE :keyword OR country.enName ILIKE :keyword OR country.code ILIKE :keyword)',
        { keyword: `%${trimmedKeyword}%` },
      );
    }

    SearchUtils.applyFilters(queryBuilder, filters || [], COUNTRY_FIELD_MAP);

    const sortOptions = SearchUtils.parseSort(
      sort?.join(',') ?? 'viName:ASC',
      Object.keys(COUNTRY_FIELD_MAP),
    );

    for (const option of sortOptions) {
      const column = COUNTRY_FIELD_MAP[option.field];
      if (!column) {
        throw new BadRequestException(
          `Sort field không hợp lệ: ${option.field}`,
        );
      }
      queryBuilder.addOrderBy(column, option.direction);
    }

    if (!sortOptions.some(option => option.field === 'id')) {
      queryBuilder.addOrderBy('country.id', 'ASC');
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

  async findById(id: number): Promise<Country | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByCode(code: string): Promise<Country | null> {
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) return null;
    return this.repo.findOne({ where: { code: normalizedCode } });
  }

  async create(country: Partial<Country>): Promise<Country> {
    const newCountry = this.repo.create(country);
    return this.repo.save(newCountry);
  }

  async update(id: number, country: Partial<Country>): Promise<Country | null> {
    await this.repo.update(id, country);
    return this.findById(id);
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return Boolean(result.affected && result.affected > 0);
  }

  async findByNameOrCode(
    viName: string,
    enName: string,
    code: string,
  ): Promise<Country | null> {
    const queryBuilder = this.repo.createQueryBuilder('country');

    queryBuilder.where(
      'country.viName = :viName OR country.enName = :enName OR country.code = :code',
      { viName, enName, code },
    );

    return queryBuilder.getOne();
  }
}
