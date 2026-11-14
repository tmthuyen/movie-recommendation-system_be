import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { SearchUtils } from '@/common/utils/search.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Rating } from './entities/rating.entity';

export const IRatingRepository = Symbol('IRatingRepository');

export interface IRatingRepository {
  findAll(request: BaseSearchRequest): Promise<[Rating[], number]>;
  findByMovie(
    movieId: number,
    request: BaseSearchRequest,
  ): Promise<[Rating[], number]>;
  findById(id: number): Promise<Rating | null>;
  create(rating: Partial<Rating>): Promise<Rating>;
  update(id: number, rating: Partial<Rating>): Promise<Rating | null>;
  remove(id: number): Promise<boolean>;
  findByUserAndMovie(userId: string, movieId: number): Promise<Rating | null>;
}

@Injectable()
export class RatingRepository implements IRatingRepository {
  constructor(
    @InjectRepository(Rating)
    private readonly repo: Repository<Rating>,
  ) {}

  private buildSearchQuery(
    request: BaseSearchRequest,
  ): SelectQueryBuilder<Rating> {
    const { keyword, filters = [], sort = ['createdAt:DESC'] } = request;

    const qb = this.repo
      .createQueryBuilder('rating')
      .leftJoinAndSelect('rating.user', 'user')
      .leftJoinAndSelect('rating.movie', 'movie');

    // keyword search: content, user, movie
    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      qb.andWhere(
        '(rating.content ILIKE :keyword OR user.fullName ILIKE :keyword OR user.email ILIKE :keyword OR movie.title ILIKE :keyword OR movie.titleVi ILIKE :keyword)',
        { keyword: `%${trimmedKeyword}%` },
      );
    }

    // ====================
    // START FILTER <= >=
    // ====================

    const fieldMap: Record<string, string> = {
      id: 'rating.id',
      rating: 'rating.rating',
      content: 'rating.content',
      timestamp: 'rating.timestamp',
      createdAt: 'rating.createdAt',
      updatedAt: 'rating.updatedAt',
      userId: 'user.id',
      userEmail: 'user.email',
      userFullName: 'user.fullName',
      movieId: 'movie.id',
      movieTitle: 'movie.title',
    };

    SearchUtils.applyFilters(qb, filters || [], fieldMap);

    // ====================
    // END FILTER <= >=
    // ====================

    // ====================
    // START SORT
    // ====================

    const sortMap = {
      id: 'rating.id',
      rating: 'rating.rating',
      timestamp: 'rating.timestamp',
      createdAt: 'rating.createdAt',
      updatedAt: 'rating.updatedAt',
    };

    const sortOptions = SearchUtils.parseSort(
      sort.join(','),
      Object.keys(sortMap),
    );

    for (const option of sortOptions) {
      const column = sortMap[option.field] as string | undefined;
      if (!column) {
        throw new BadRequestException(
          `Sort field không hợp lệ: ${option.field}`,
        );
      }
      qb.addOrderBy(column, option.direction);
    }

    // stable sort by id
    if (!sortOptions.some(option => option.field === 'id')) {
      qb.addOrderBy('rating.id', 'ASC');
    }

    // ====================
    // END SORT
    // ====================

    return qb;
  }

  async findAll(request: BaseSearchRequest): Promise<[Rating[], number]> {
    const { page = 1, limit = 10 } = request;
    const skip = (page - 1) * limit;

    const queryBuilder = this.buildSearchQuery(request).skip(skip).take(limit);

    return queryBuilder.getManyAndCount();
  }

  async findByMovie(
    movieId: number,
    request: BaseSearchRequest,
  ): Promise<[Rating[], number]> {
    const { page = 1, limit = 10 } = request;
    const skip = (page - 1) * limit;

    const queryBuilder = this.buildSearchQuery(request)
      .andWhere('rating.movie_id = :movieId', { movieId })
      .skip(skip)
      .take(limit);

    return queryBuilder.getManyAndCount();
  }

  async findById(id: number): Promise<Rating | null> {
    return this.repo
      .createQueryBuilder('rating')
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

  async findByUserAndMovie(
    userId: string,
    movieId: number,
  ): Promise<Rating | null> {
    return this.repo
      .createQueryBuilder('rating')
      .leftJoin('rating.user', 'user')
      .leftJoin('rating.movie', 'movie')
      .addSelect(['user.id', 'movie.id'])
      .where('rating.user_id = :userId', { userId })
      .andWhere('rating.movie_id = :movieId', { movieId })
      .getOne();
  }
}
