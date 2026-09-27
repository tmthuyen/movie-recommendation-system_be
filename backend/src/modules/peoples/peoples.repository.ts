import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { People } from './entities/people.entity';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';

export const IPeopleRepository = Symbol('IPeopleRepository');

export interface IPeopleRepository {
  findAll(paginationDto: PaginationDto): Promise<PaginatedResult<People>>;
  findById(id: number): Promise<People | null>;
  create(people: Partial<People>): Promise<People>;
  update(id: number, people: Partial<People>): Promise<People | null>;
  remove(id: number): Promise<boolean>;
}

@Injectable()
export class PeopleRepository implements IPeopleRepository {
  constructor(
    @InjectRepository(People)
    private readonly repo: Repository<People>,
  ) {}

  async findAll(paginationDto: PaginationDto): Promise<PaginatedResult<People>> {
    const { page = 1, limit = 10, keyword } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo.createQueryBuilder('people');

    if (keyword) {
      queryBuilder.where('people.fullName ILIKE :keyword', { keyword: `%${keyword}%` });
    }

    queryBuilder.skip(skip).take(limit).orderBy('people.createdAt', 'DESC');

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
