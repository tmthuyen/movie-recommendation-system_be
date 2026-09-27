import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Rating } from './entities/rating.entity';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';

export const IRatingRepository = Symbol('IRatingRepository');

export interface IRatingRepository {
  findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Rating>>;
  findByMovie(movieId: number, paginationDto: PaginationDto): Promise<PaginatedResult<Rating>>;
  findById(id: number): Promise<Rating | null>;
  create(rating: Partial<Rating>): Promise<Rating>;
  update(id: number, rating: Partial<Rating>): Promise<Rating | null>;
  remove(id: number): Promise<boolean>;
}

@Injectable()
export class RatingRepository implements IRatingRepository {
  constructor(
    @InjectRepository(Rating)
    private readonly repo: Repository<Rating>,
  ) {}

  async findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Rating>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo.createQueryBuilder('rating')
      .leftJoinAndSelect('rating.user', 'user')
      .leftJoinAndSelect('rating.movie', 'movie')
      .skip(skip)
      .take(limit)
      .orderBy('rating.createdAt', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByMovie(movieId: number, paginationDto: PaginationDto): Promise<PaginatedResult<Rating>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo.createQueryBuilder('rating')
      .leftJoinAndSelect('rating.user', 'user')
      .where('rating.movie_id = :movieId', { movieId })
      .skip(skip)
      .take(limit)
      .orderBy('rating.createdAt', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number): Promise<Rating | null> {
    return this.repo.createQueryBuilder('rating')
      .leftJoinAndSelect('rating.user', 'user')
      .leftJoinAndSelect('rating.movie', 'movie')
      .where('rating.id = :id', { id })
      .getOne();
  }

  async create(rating: Partial<Rating>): Promise<Rating> {
    const newRating = this.repo.create(rating);
    return this.repo.save(newRating);
  }

  async update(id: number, rating: Partial<Rating>): Promise<Rating | null> {
    await this.repo.update(id, rating);
    return this.findById(id);
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return Boolean(result.affected && result.affected > 0);
  }
}
