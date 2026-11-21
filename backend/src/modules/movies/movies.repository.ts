import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movie } from './entities/movie.entity';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';
import { SearchUtils } from '@/common/utils/search.util';

export const IMovieRepository = Symbol('IMovieRepository');

export interface IMovieRepository {
  findAll(request: BaseSearchRequest): Promise<PaginatedResult<Movie>>;
  findById(id: number): Promise<Movie | null>;
  findByTmdbId(tmdbId: number): Promise<Movie | null>;
  create(movie: Partial<Movie>): Promise<Movie>;
  update(id: number, movie: Partial<Movie>): Promise<Movie | null>;
  remove(id: number): Promise<boolean>;
  findAllByIds(ids: number[]): Promise<Movie[]>;
}

const MOVIE_FIELD_MAP: Record<string, string> = {
  id: 'movie.id',
  tmdbId: 'movie.tmdbId',
  imdbId: 'movie.imdbId',
  title: 'movie.title',
  titleVi: 'movie.titleVi',
  overview: 'movie.overview',
  overviewVi: 'movie.overviewVi',
  homepage: 'movie.homepage',
  posterPath: 'movie.posterPath',
  backdropPath: 'movie.backdropPath',
  releaseDate: 'movie.releaseDate',
  status: 'movie.status',
  originCountry: 'movie.originCountry',
  originalLanguage: 'movie.originalLanguage',
  tmdbRating: 'movie.tmdbRating',
  voteAverage: 'movie.voteAverage',
  voteCount: 'movie.voteCount',
  viewCount: 'movie.viewCount',
  likeCount: 'movie.likeCount',
  createdAt: 'movie.createdAt',
  updatedAt: 'movie.updatedAt',
  genreId: 'genre.id',
  countryId: 'country.id',
  peopleId: 'people.id',
};

const MOVIE_SORT_MAP: Record<string, string> = {
  id: 'movie.id',
  title: 'movie.title',
  titleVi: 'movie.titleVi',
  releaseDate: 'movie.releaseDate',
  tmdbRating: 'movie.tmdbRating',
  voteAverage: 'movie.voteAverage',
  voteCount: 'movie.voteCount',
  viewCount: 'movie.viewCount',
  likeCount: 'movie.likeCount',
  createdAt: 'movie.createdAt',
  updatedAt: 'movie.updatedAt',
};

@Injectable()
export class MovieRepository implements IMovieRepository {
  private readonly logger = new Logger(MovieRepository.name);
  constructor(
    @InjectRepository(Movie)
    private readonly repo: Repository<Movie>,
  ) {}

  async findAll(request: BaseSearchRequest): Promise<PaginatedResult<Movie>> {
    const { page = 1, limit = 10, keyword, filters = [], sort } = request;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('movie')
      .leftJoinAndSelect('movie.genres', 'genre')
      .leftJoinAndSelect('movie.countries', 'country')
      .leftJoinAndSelect('movie.moviePeoples', 'moviePeople')
      .leftJoinAndSelect('moviePeople.people', 'people');

    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      queryBuilder.andWhere(
        '(movie.title ILIKE :keyword OR movie.titleVi ILIKE :keyword)',
        { keyword: `%${trimmedKeyword}%` },
      );
    }

    SearchUtils.applyFilters(queryBuilder, filters || [], MOVIE_FIELD_MAP);

    const sortOptions = SearchUtils.parseSort(
      sort?.join(',') ?? 'createdAt:DESC',
      Object.keys(MOVIE_SORT_MAP),
    );

    for (const option of sortOptions) {
      const column = MOVIE_SORT_MAP[option.field];
      if (!column) {
        throw new BadRequestException(
          `Sort field không hợp lệ: ${option.field}`,
        );
      }
      queryBuilder.addOrderBy(column, option.direction);
    }

    if (!sortOptions.some(option => option.field === 'id')) {
      queryBuilder.addOrderBy('movie.id', 'ASC');
    }

    queryBuilder.skip(skip).take(limit);

    const sql = queryBuilder.getSql();
    this.logger.debug(`findAll SQL: ${sql}`, 'MovieRepository');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number): Promise<Movie | null> {
    return this.repo
      .createQueryBuilder('movie')
      .leftJoinAndSelect('movie.genres', 'genre')
      .leftJoinAndSelect('movie.moviePeoples', 'moviePeople')
      .leftJoinAndSelect('moviePeople.people', 'people')
      .where('movie.id = :id', { id })
      .getOne();
  }

  async findByTmdbId(tmdbId: number): Promise<Movie | null> {
    return this.repo.findOne({ where: { tmdbId } });
  }

  async create(movie: Partial<Movie>): Promise<Movie> {
    const newMovie = this.repo.create(movie);
    return this.repo.save(newMovie);
  }

  async update(id: number, movie: Partial<Movie>): Promise<Movie | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    const updated = this.repo.merge(existing, movie);
    await this.repo.save(updated);
    return this.findById(id);
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return Boolean(result.affected && result.affected > 0);
  }

  async findAllByIds(ids: number[]): Promise<Movie[]> {
    return this.repo
      .createQueryBuilder('movie')
      .leftJoinAndSelect('movie.genres', 'genre')
      .leftJoinAndSelect('movie.countries', 'country')
      .leftJoinAndSelect('movie.moviePeoples', 'moviePeople')
      .leftJoinAndSelect('moviePeople.people', 'people')
      .whereInIds(ids)
      .getMany();
  }
}
