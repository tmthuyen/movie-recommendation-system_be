import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { CreateMovieDto } from './dto/create-movie.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { IMovieRepository } from './movies.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { MovieProducer } from '@/infrastructure/messaging/producers/movie.producer';
import { DataSource } from 'typeorm';
import { EventsGateway } from '@/modules/events/events.gateway';
import {
  Interaction,
  InteractionType,
  MAX_INTERACTION_SCORE,
} from '@/modules/interactions/entities/interaction.entity';
import { Movie } from './entities/movie.entity';
import { Genre } from '@/modules/genres/entities/genre.entity';
import { Country } from '@/modules/countries/entities/country.entity';
import { People } from '@/modules/peoples/entities/people.entity';
import { BadRequestException } from '@nestjs/common';
import {
  MovieCreatedPayload,
  MovieUpdatedPayload,
} from '@/infrastructure/messaging/event.types';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { MovieInteractionStatsService } from '@/modules/interactions/movie-interaction-stats.service';
import { MovieSearchRequestDto } from '@/modules/movies/dto/movie-search-request.dto';
import {
  PaginatedResult,
  ResultWithPagination,
} from '@/common/dtos/paginated-result.interface';
import { ICacheService } from '@/infrastructure/cache/redis-cache.service';
import {
  CacheKeys,
  CacheTtl,
  MAX_CACHED_PAGE,
} from '@/infrastructure/cache/cache.keys';
import {
  MovieDetailCacheSchema,
  MovieListCacheSchema,
  MovieSearchCacheSchema,
} from '@/infrastructure/cache/cache.schemas';
import { parseIdUtils } from '@/common/utlils/parseIdUtils';

@Injectable()
export class MoviesService {
  private readonly logger = new Logger(MoviesService.name);
  private readonly allowMovieSortFields = [
    'releaseDate',
    'voteAverage',
    'viewCount',
    'likeCount',
    'createdAt',
  ];

  constructor(
    @Inject(IMovieRepository)
    private readonly repo: IMovieRepository,
    private readonly dataSource: DataSource,
    private readonly movieProducer: MovieProducer,
    private readonly eventsGateway: EventsGateway,
    private readonly interactionProducer: InteractionProducer,
    private readonly statsService: MovieInteractionStatsService,
    @Inject(ICacheService) private readonly cache: ICacheService,
  ) {}

  private mapDtoToEntity(dto: any) {
    const { genreIds, countryId, peopleIds, ...rest } = dto;
    const entity: any = { ...rest };
    if (genreIds) entity.genres = genreIds.map((id: number) => ({ id }));
    if (countryId) entity.country = { id: countryId };
    if (peopleIds)
      entity.moviePeoples = peopleIds.map((id: number) => ({ people: { id } }));
    return entity;
  }

  private async validateRelations(dto: any) {
    const { genreIds, countryId, peopleIds } = dto;
    if (genreIds && genreIds.length > 0) {
      const count = await this.dataSource.getRepository(Genre).count({
        where: genreIds.map((id: number) => ({ id })),
      });
      if (count !== genreIds.length)
        throw new BadRequestException('Một hoặc nhiều thể loại không tồn tại');
    }
    if (countryId) {
      const exists = await this.dataSource
        .getRepository(Country)
        .findOne({ where: { id: countryId } });
      if (!exists) throw new BadRequestException('Quốc gia không tồn tại');
    }
    if (peopleIds && peopleIds.length > 0) {
      const count = await this.dataSource.getRepository(People).count({
        where: peopleIds.map((id: number) => ({ id })),
      });
      if (count !== peopleIds.length)
        throw new BadRequestException('Một hoặc nhiều nhân vật không tồn tại');
    }
  }

  testMovieCreated(createMovieDto: CreateMovieDto) {
    // Publish movie.created event
    if (createMovieDto) {
      const payload: MovieCreatedPayload = {
        movieId: 101000,
        title: '',
        titleVi: createMovieDto.titleVi || '',
        overview: createMovieDto.overview || '',
        overviewVi: createMovieDto.overviewVi || '',
        genres: ['test genre'],
      };
      this.movieProducer.publishMovieCreated(payload);
    }
  }

  async seedMovies() {
    this.logger.log('Seeding movies...');
    const MAX_PAGE = 15;
    let page = 1;
    let cnt = 0;
    while (page <= MAX_PAGE) {
      const result = await this.repo.findAll({
        page: page,
        limit: 1000,
      });
      for (const movie of result.data) {
        const payload: MovieCreatedPayload = {
          movieId: movie.id,
          title: movie.title,
          titleVi: movie.titleVi,
          overview: movie.overview,
          overviewVi: movie.overviewVi,
          genres: movie.genres?.map(g => g.name) || [],
        };
        this.movieProducer.publishMovieCreated(payload);
      }

      page++;
      cnt += result.data.length;
      // sleep 5s
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    this.logger.log(`Published ${cnt} movie.created events.`);
  }

  async create(createMovieDto: CreateMovieDto) {
    await this.validateRelations(createMovieDto);
    const entity = this.mapDtoToEntity(createMovieDto) as Partial<Movie>;
    const saved = await this.repo.create(entity);

    // Fetch full movie with relations for queue
    const fullMovie = await this.repo.findById(saved.id);

    // Publish movie.created event
    if (fullMovie) {
      const payload: MovieCreatedPayload = {
        movieId: fullMovie.id,
        title: fullMovie.title,
        titleVi: fullMovie.titleVi,
        overview: fullMovie.overview,
        overviewVi: fullMovie.overviewVi,
        genres: fullMovie.genres?.map(g => g.name) || [],
      };
      this.movieProducer.publishMovieCreated(payload);
    }

    // Làm mới version danh sách phim.
    await this.cache.incr(CacheKeys.movie.listVersion());

    return saved;
  }

  async findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Movie>> {
    const { page = 1, limit = 10, keyword } = paginationDto;

    // Chỉ cache trang <= MAX_CACHED_PAGE.
    if (page > MAX_CACHED_PAGE) {
      return this.repo.findAll(paginationDto);
    }

    const version = await this.cache.getCounter(CacheKeys.movie.listVersion());
    const key = CacheKeys.movie.list(
      version,
      page,
      limit,
      keyword ? { keyword } : undefined,
    );
    const ttl = keyword ? CacheTtl.movieKeyword : CacheTtl.movieList;

    return this.cache.getOrLoad<PaginatedResult<Movie>>({
      key,
      schema: MovieListCacheSchema,
      ttlSeconds: ttl,
      loader: async () => {
        const rs = await this.repo.findAll(paginationDto);
        return {
          ...rs,
          data: rs.data.map(movie => ({
            ...movie,
            id: parseIdUtils.toSafeNumberId(movie.id),
          })),
        };
      },
    });
  }

  /** Đọc phim trực tiếp từ DB (bỏ qua cache). */
  private async findOneFresh(id: number): Promise<Movie> {
    const movie = await this.repo.findById(id);
    if (!movie) {
      throw new NotFoundException(`Không tìm thấy phim với ID ${id}`);
    }
    return movie;
  }

  async findOne(id: number): Promise<Movie> {
    return this.cache.getOrLoad<Movie>({
      key: CacheKeys.movie.detail(id),
      schema: MovieDetailCacheSchema,
      ttlSeconds: CacheTtl.movieDetail,
      loader: async () => {
        const movie = await this.findOneFresh(id);
        return { ...movie, id: parseIdUtils.toSafeNumberId(movie.id) };
      },
    });
  }

  async update(id: number, updateMovieDto: UpdateMovieDto) {
    const movie = await this.findOneFresh(id); // Kiểm tra tồn tại (đọc DB)
    await this.validateRelations(updateMovieDto);
    const entity = this.mapDtoToEntity(updateMovieDto);

    // Check if relevant fields changed
    const aiFields = [
      'title',
      'titleVi',
      'overview',
      'overviewVi',
      'genreIds',
      'peopleIds',
    ];
    let hasChanges = false;
    for (const field of aiFields) {
      if (
        updateMovieDto[field as keyof UpdateMovieDto] !== undefined &&
        updateMovieDto[field as keyof UpdateMovieDto] !==
          movie[field as keyof typeof movie]
      ) {
        hasChanges = true;
        break;
      }
    }
    const updated = await this.repo.update(movie.id, entity);

    if (hasChanges && updated) {
      const fullMovie = await this.repo.findById(updated.id);
      if (fullMovie) {
        const payload: MovieUpdatedPayload = {
          movieId: fullMovie.id,
          title: fullMovie.title,
          titleVi: fullMovie.titleVi,
          overview: fullMovie.overview,
          overviewVi: fullMovie.overviewVi,
          genres: fullMovie.genres?.map(g => g.name) || [],
        };
        this.movieProducer.publishMovieUpdated(payload);
      }
    }

    await this.invalidateAfterMovieChange(id);

    return updated;
  }

  async remove(id: number) {
    const movie = await this.findOneFresh(id); // Kiểm tra tồn tại (đọc DB)
    await this.repo.remove(movie.id);

    this.movieProducer.publishMovieDeleted({ movieId: id });

    await this.invalidateAfterMovieChange(id);

    return { success: true };
  }

  /** Xoá cache chi tiết phim và tăng version list/recommendation. */
  private async invalidateAfterMovieChange(movieId: number): Promise<void> {
    await this.cache.del(CacheKeys.movie.detail(movieId));
    await this.cache.incr(CacheKeys.movie.listVersion());
    await this.cache.incr(CacheKeys.recommendation.similarVersion(movieId));
  }

  async incrementViewCount(id: number, userId?: string) {
    // Đọc DB trực tiếp cho luồng tăng view.
    const movie = await this.findOneFresh(id);

    const {
      score,
      interaction: interactionState,
      createdInteraction,
    } = await this.dataSource.transaction(async manager => {
      // 1. Luôn tăng viewCount (kể cả guest)
      movie.viewCount = Number(movie.viewCount) + 1;
      await manager.update(Movie, movie.id, { viewCount: movie.viewCount });

      // 2. User đăng nhập: tạo mới hoặc tăng độ tin cậy của click
      if (!userId) {
        return {
          score: 0,
          interaction: 'none' as const,
          createdInteraction: null,
        };
      }

      const existingInteraction = await manager.findOne(Interaction, {
        where: {
          user: { id: userId } as any,
          movie: { id: movie.id } as any,
          type: InteractionType.CLICK,
        },
      });

      if (existingInteraction) {
        // Xem lại: tăng độ tin cậy, tối đa band 5; KHÔNG publish lại (tránh spam AI)
        const nextScore = Math.min(
          MAX_INTERACTION_SCORE,
          Number(existingInteraction.score) + 1,
        );
        await manager.update(Interaction, existingInteraction.id, {
          score: nextScore,
        });
        return {
          score: nextScore,
          interaction: 'updated' as const,
          createdInteraction: null,
        };
      }

      const initialScore = 1;
      const interaction = manager.create(Interaction, {
        score: initialScore,
        type: InteractionType.CLICK,
        movie: { id: movie.id } as any,
        user: { id: userId } as any,
      });
      const created = await manager.save(interaction);
      return {
        score: initialScore,
        interaction: 'created' as const,
        createdInteraction: created,
      };
    });

    // 3. Realtime sau commit
    const numericMovieId = Number(movie.id);
    this.eventsGateway.broadcastViewCount(numericMovieId, movie.viewCount);

    if (userId && interactionState !== 'none') {
      const stats = await this.statsService.getStats(numericMovieId);
      this.eventsGateway.broadcastInteraction({
        movieId: numericMovieId,
        type: InteractionType.CLICK,
        action: interactionState === 'updated' ? 'updated' : 'added',
        score,
        likeCount: stats.likeCount,
        commentCount: stats.commentCount,
        viewCount: stats.viewCount,
      });
    }

    // publish queue khi click movie (cả mới và cũ)
    if (userId) {
      this.interactionProducer.publishInteractionCreated({
        userId,
        movieId: numericMovieId,
        action: InteractionType.CLICK,
        score: null, // không cần score
        removed: false,
        createdAt: new Date(),
      });
    }

    return {
      viewCount: movie.viewCount,
      score,
      interaction: interactionState,
    };
  }

  /** search nâng cao
   * @param query: MovieSearchRequestDto
   * @returns ResultWithPagination<Movie>
   */
  async search(
    query: MovieSearchRequestDto,
  ): Promise<ResultWithPagination<Movie>> {
    const { page = 1, limit = 10, keyword } = query;

    if (page > MAX_CACHED_PAGE) {
      return this.searchFromDb(query);
    }

    const version = await this.cache.getCounter(CacheKeys.movie.listVersion());
    const key = CacheKeys.movie.search(version, page, limit, {
      keyword: keyword?.trim() || undefined,
      sort: query.sort ?? 'releaseDate:DESC',
      genreIds: query.genreIds,
      countryIds: query.countryIds,
      releaseYearFrom: query.releaseYearFrom,
      releaseYearTo: query.releaseYearTo,
    });
    const ttl = keyword?.trim() ? CacheTtl.movieKeyword : CacheTtl.movieList;

    return this.cache.getOrLoad<ResultWithPagination<Movie>>({
      key,
      schema: MovieSearchCacheSchema,
      ttlSeconds: ttl,
      loader: async () => {
        const rs = await this.searchFromDb(query);

        return {
          ...rs,
          result: rs.result.map(movie => ({
            ...movie,
            id: parseIdUtils.toSafeNumberId(movie.id),
          })),
        };
      },
    });
  }

  private async searchFromDb(
    query: MovieSearchRequestDto,
  ): Promise<ResultWithPagination<Movie>> {
    const {
      page = 1,
      limit = 10,
      keyword,
      sort = 'releaseDate:DESC',
      countryIds,
      genreIds,
      releaseYearFrom,
      releaseYearTo,
    } = query;

    const queryBuilder = this.dataSource
      .getRepository(Movie)
      .createQueryBuilder('movie');

    // ====================
    // loại nhứng phim không hợp lệ:
    // title titleVi null, releaseDate null,
    // overview null, overviewVi null,
    // posterPath null, backdropPath null
    //
    // ====================
    queryBuilder.andWhere('movie.title IS NOT NULL');
    queryBuilder.andWhere('movie.titleVi IS NOT NULL');
    queryBuilder.andWhere('movie.releaseDate IS NOT NULL');
    queryBuilder.andWhere('movie.overview IS NOT NULL');
    queryBuilder.andWhere('movie.overviewVi IS NOT NULL');
    queryBuilder.andWhere('movie.posterPath IS NOT NULL');
    queryBuilder.andWhere('movie.backdropPath IS NOT NULL');

    // keyword search: titile, titleVi
    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      queryBuilder.andWhere(
        '(movie.title ILIKE :keyword OR movie.titleVi ILIKE :keyword)',
        { keyword: `%${trimmedKeyword}%` },
      );
    }

    // ====================
    // JOIN FK
    // ====================

    // genres
    queryBuilder
      .leftJoin('movie.genres', 'genre')
      .addSelect(['genre.id', 'genre.name']);
    if (genreIds && genreIds.length > 0) {
      queryBuilder.andWhere('genre.id IN (:...genreIds)', { genreIds });
    }

    // country
    queryBuilder.leftJoinAndSelect('movie.countries', 'country');
    if (countryIds && countryIds.length > 0) {
      queryBuilder.andWhere('country.id IN (:...countryIds)', { countryIds });
    }

    // people
    queryBuilder
      .leftJoin('movie.moviePeoples', 'moviePeople')
      .leftJoin('moviePeople.people', 'people')
      .addSelect(['people.id', 'people.fullName', 'people.mainRole']);
    // chưa filter peopleIds

    // ====================
    // END JOIN FK
    // ====================

    // ====================
    // START FILTER <= >=
    // ====================

    // releaseYearFrom
    if (releaseYearFrom) {
      queryBuilder.andWhere('movie.releaseDate >= :startDate', {
        startDate: `${releaseYearFrom}-01-01`,
      });
    }

    // releaseYearTo
    if (releaseYearTo) {
      queryBuilder.andWhere('movie.releaseDate <= :endDate', {
        endDate: `${releaseYearTo}-12-31`,
      });
    }

    // ====================
    // END FILTER <= >=
    // ====================

    // ====================
    // START SORT
    // ====================

    const sortOptions = SearchUtils.parseSort(sort, this.allowMovieSortFields);

    for (const option of sortOptions) {
      queryBuilder.addOrderBy(`movie.${option.field}`, option.direction);
    }

    // stable sort by id
    if (!sortOptions.some(option => option.field === 'id')) {
      queryBuilder.addOrderBy('movie.id', 'ASC');
    }

    // ====================
    // END SORT
    // ====================

    // ====================
    // START PAGINATION
    // ====================
    const skip = (page - 1) * limit;

    queryBuilder.skip(skip).take(limit);

    // this.logger.log(`Executing search query: ${queryBuilder.getSql()}`);

    const [data, total] = await queryBuilder.getManyAndCount();

    const pagination = PaginationUtils.getPaginationMeta(page, limit, total);

    // ====================
    // END PAGINATION
    // ====================

    return {
      result: data,
      pagination,
    };
  }

  /**
   * Tìm nhiều phim theo mảng ID
   * @param ids: number[]
   * @returns Movie[]
   */
  async findByIds(ids: number[]): Promise<Movie[]> {
    if (!ids || ids.length === 0) {
      return [];
    }

    const movies = await this.repo.findAllByIds(ids);
    return movies;
  }
}

class PaginationUtils {
  static getPaginationMeta(page: number, limit: number, total: number) {
    const totalPages = Math.ceil(total / limit);
    return {
      page,
      limit,
      total,
      totalPages,
    };
  }
}

/** Sort option interface
 * field: string, direction: 'ASC' | 'DESC'
 */
export interface SortOption {
  field: string;
  direction: 'ASC' | 'DESC';
}

class SearchUtils {
  static allowDirections = ['ASC', 'DESC'];

  /** Parse sort string thành mảng các option để dùng trong query builder
   * @param sort: string, ví dụ: "releaseDate:DESC,voteAverage:ASC"
   * @param allowedFields: mảng các field được phép sort, ví dụ: ['releaseDate', 'voteAverage']
   * @returns Array<{ field: string, direction: 'ASC' | 'DESC' }>
   * @throws BadRequestException nếu sort không hợp lệ
   */
  static parseSort(sort: string, allowedFields: string[]): Array<SortOption> {
    if (!sort) return [{ field: 'releaseDate', direction: 'DESC' }];

    // map allowFields
    // ánh xạ field
    const mapField = new Map<string, string>();
    for (const f of allowedFields) {
      mapField.set(f.toLowerCase(), f);
    }

    // trả về field và direction đúng quy định
    const sortOptions = sort.split(',').map(s => {
      const [field, direction] = s.split(':');

      if (!field || !direction) {
        throw new BadRequestException('Invalid sort format');
      }

      const mappedField = mapField.get(field.toLowerCase());
      if (!mappedField) {
        throw new BadRequestException('Invalid sort field');
      }

      if (!SearchUtils.allowDirections.includes(direction.toUpperCase())) {
        throw new BadRequestException('Invalid sort direction');
      }

      return { field: mappedField, direction: direction.toUpperCase() };
    });

    return sortOptions as Array<SortOption>;
  }
}
