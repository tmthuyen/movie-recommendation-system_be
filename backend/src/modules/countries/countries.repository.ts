import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import { Country } from './entities/country.entity';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';

export const ICountryRepository = Symbol('ICountryRepository');

export interface ICountryRepository {
  findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Country>>;
  findById(id: number): Promise<Country | null>;
  create(country: Partial<Country>): Promise<Country>;
  update(id: number, country: Partial<Country>): Promise<Country | null>;
  remove(id: number): Promise<boolean>;
}

@Injectable()
export class CountryRepository implements ICountryRepository {
  constructor(
    @InjectRepository(Country)
    private readonly repo: Repository<Country>,
  ) {}

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Country>> {
    const { page = 1, limit = 10, keyword } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo.createQueryBuilder('country');

    if (keyword) {
      queryBuilder.where('country.name ILIKE :keyword', {
        keyword: `%${keyword}%`,
      });
    }

    queryBuilder.skip(skip).take(limit).orderBy('country.createdAt', 'DESC');

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
}
