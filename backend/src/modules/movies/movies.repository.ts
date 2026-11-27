import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { Movie } from './entities/movie.entity';
import { MoviePeople } from './entities/movie-people.entity';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';
import { SearchUtils } from '@/common/utils/search.util';

export const IMovieRepository = Symbol('IMovieRepository');

/** `undefined` = giữ nguyên; `[]` = xoá sạch; mảng ID = thay thế toàn bộ quan hệ. */
export interface MovieRelationIds {
  genreIds?: number[];
  countryIds?: number[];
  peopleIds?: number[];
}

export interface IMovieRepository {
  findAll(request: BaseSearchRequest): Promise<PaginatedResult<Movie>>;
  findById(id: number): Promise<Movie | null>;
  findByTmdbId(tmdbId: number): Promise<Movie | null>;
  create(movie: Partial<Movie>): Promise<Movie>;
  update(id: number, movie: Partial<Movie>): Promise<Movie | null>;
  createWithRelations(
    movie: Partial<Movie>,
    relations: MovieRelationIds,
  ): Promise<Movie>;
  updateWithRelations(
    id: number,
    movie: Partial<Movie>,
    relations: MovieRelationIds,
  ): Promise<Movie | null>;
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
    private readonly dataSource: DataSource,
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
    // this.logger.debug(`findAll SQL: ${sql}`, 'MovieRepository');

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
      .leftJoinAndSelect('movie.countries', 'country')
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

  /**
   * Scalar + 3 nhánh quan hệ nằm trong cùng một transaction.
   * Không dùng `repo.merge()` cho mảng relation: merge gộp theo index, không thay thế join table.
   */
  async createWithRelations(
    movie: Partial<Movie>,
    relations: MovieRelationIds,
  ): Promise<Movie> {
    this.logger.log(
      `Bắt đầu transaction tạo phim: fields=[${Object.keys(movie).join(',')}]`,
    );
    try {
      const saved = await this.dataSource.transaction(async manager => {
        const repo = manager.getRepository(Movie);
        const entity = repo.create(movie);
        const created = await repo.save(entity);
        await this.applyRelations(manager, created.id, relations);
        return created;
      });
      this.logger.log(`Kết thúc transaction tạo phim: movieId=${saved.id}`);
      return saved;
    } catch (error) {
      this.logger.error(
        `Transaction tạo phim thất bại: fields=[${Object.keys(movie).join(',')}]`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async updateWithRelations(
    id: number,
    movie: Partial<Movie>,
    relations: MovieRelationIds,
  ): Promise<Movie | null> {
    this.logger.log(
      `Bắt đầu transaction cập nhật phim: movieId=${id}, fields=[${Object.keys(movie).join(',')}]`,
    );
    try {
      const existing = await this.dataSource.transaction(async manager => {
        const repo = manager.getRepository(Movie);
        const current = await repo.findOne({
          where: { id },
          select: { id: true },
        });
        if (!current) return null;

        if (Object.keys(movie).length > 0) {
          await repo.update(id, movie);
        }
        await this.applyRelations(manager, id, relations);
        return current;
      });
      this.logger.log(`Kết thúc transaction cập nhật phim: movieId=${id}`);
      return existing;
    } catch (error) {
      this.logger.error(
        `Transaction cập nhật phim thất bại: movieId=${id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /**
   * ManyToMany không dùng `.set()` — TypeORM chỉ cho phép set với
   * many-to-one/one-to-one. Đọc ID hiện tại rồi add/remove phần khác nhau:
   * `[]` → remove hết, create mới → loadMany trả rỗng → add hết.
   */
  private async syncManyToMany(
    manager: EntityManager,
    property: 'genres' | 'countries',
    movieId: number,
    ids: number[],
  ): Promise<void> {
    const relation = manager
      .getRepository(Movie)
      .createQueryBuilder()
      .relation(Movie, property)
      .of(movieId);

    const currentIds = new Set(
      (await relation.loadMany<{ id: number }>()).map(item => Number(item.id)),
    );
    const nextIds = new Set(ids.map(id => Number(id)));

    await relation.addAndRemove(
      [...nextIds].filter(id => !currentIds.has(id)).sort((a, b) => a - b),
      [...currentIds].filter(id => !nextIds.has(id)).sort((a, b) => a - b),
    );
  }

  /** Dùng chung cho create/update. `undefined` = giữ nguyên, `[]` = xoá sạch. */
  private async applyRelations(
    manager: EntityManager,
    movieId: number,
    relations: MovieRelationIds,
  ): Promise<void> {
    if (relations.genreIds !== undefined) {
      await this.syncManyToMany(manager, 'genres', movieId, relations.genreIds);
    }

    if (relations.countryIds !== undefined) {
      await this.syncManyToMany(
        manager,
        'countries',
        movieId,
        relations.countryIds,
      );
    }

    if (relations.peopleIds !== undefined) {
      // `movie_peoples` có PK kép + cột role → không dùng `.set()`.
      const ids = relations.peopleIds;
      const peopleRepo = manager.getRepository(MoviePeople);
      const existingRows = ids.length
        ? await peopleRepo.find({
            where: { movieId, peopleId: In(ids) },
            select: { peopleId: true, role: true },
          })
        : [];
      const roleByPeopleId = new Map(
        existingRows.map(row => [Number(row.peopleId), row.role]),
      );

      await peopleRepo.delete({ movieId });
      if (ids.length > 0) {
        await peopleRepo.insert(
          ids.map(peopleId => ({
            movieId,
            peopleId,
            role: roleByPeopleId.get(peopleId) ?? 'actor',
          })),
        );
      }
    }
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
