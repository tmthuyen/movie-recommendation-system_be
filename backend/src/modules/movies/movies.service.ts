import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { CreateMovieDto } from './dto/create-movie.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { IMovieRepository, type MovieRelationIds } from './movies.repository';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { MovieProducer } from '@/infrastructure/messaging/producers/movie.producer';
import { DataSource, EntityTarget, In } from 'typeorm';
import { EventsGateway } from '@/modules/events/events.gateway';
import {
  Interaction,
  InteractionScoreMap,
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
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import { MovieInteractionStatsService } from '@/modules/interactions/movie-interaction-stats.service';
import { MovieSearchRequestDto } from '@/modules/movies/dto/movie-search-request.dto';
import {
  PaginatedResult,
  ResultWithPagination,
} from '@/common/dtos/paginated-result.interface';
import {
  CACHE_SERVICE,
  type ICacheService,
} from '@/infrastructure/cache/redis-cache.service';
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
import { idUtil } from '@/common/utils/id.util';
import { PaginationUtils, SearchUtils } from '@/common/utils/search.util';
import { REDIS_SERVICE } from '@/infrastructure/redis/redis.service';
import type { IRedisService } from '@/infrastructure/redis/redis.service';
import {
  type SearchEventContext,
  type SearchEventMode,
  SearchEventService,
} from '@/infrastructure/messaging/search-event.service';

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
    private readonly userProducer: UserProducer,
    private readonly statsService: MovieInteractionStatsService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    @Inject(REDIS_SERVICE) private readonly redis: IRedisService,
    private readonly searchEventService: SearchEventService,
  ) {}

  /**
   * Phát event search ngay trong service sau khi đã có kết quả.
   * Chỉ phát cho user JWT, trang đầu và có ít nhất một phim; controller không điều phối bước này.
   * @returns Promise<void>; không ghi DB/Redis, guest hoặc trang sau bị bỏ qua.
   */
  private async publishSearchIfEligible(
    context: SearchEventContext | undefined,
    keywordRaw: string,
    mode: SearchEventMode,
    resultCount: number,
  ): Promise<void> {
    if (
      context?.isFirstPage === false ||
      !context?.userId ||
      resultCount <= 0
    ) {
      return;
    }

    await this.searchEventService.publishIfEligible({
      userId: context.userId,
      keywordRaw,
      mode,
      resultCount,
      correlationId: context.correlationId,
    });
  }

  private uniqueIds(ids?: number[]): number[] {
    if (!Array.isArray(ids)) return [];
    return [...new Set(ids.map(id => Number(id)).filter(Number.isFinite))];
  }

  private mapDtoToEntity(dto: any) {
    const { genreIds, countryIds, peopleIds, ...rest } = dto;
    const entity: any = { ...rest };

    // undefined = giữ nguyên quan hệ; [] = xoá toàn bộ quan hệ.
    // Quan hệ không nằm trong entity nữa — repository.applyRelations thay thế join table.
    return entity;
  }

  /** Tách mảng ID đã dedupe/sort; không truyền field nào = giữ nguyên quan hệ đó. */
  private extractRelationIds(dto: {
    genreIds?: number[];
    countryIds?: number[];
    peopleIds?: number[];
  }): MovieRelationIds {
    const toIds = (ids?: number[]) =>
      this.uniqueIds(ids).sort((left, right) => left - right);
    const relations: MovieRelationIds = {};

    if (Array.isArray(dto?.genreIds)) relations.genreIds = toIds(dto.genreIds);
    if (Array.isArray(dto?.countryIds)) {
      relations.countryIds = toIds(dto.countryIds);
    }
    if (Array.isArray(dto?.peopleIds)) {
      relations.peopleIds = toIds(dto.peopleIds);
    }
    return relations;
  }

  private getCurrentRelationIds(movie: Movie): MovieRelationIds & {
    genreIds: number[];
    countryIds: number[];
    peopleIds: number[];
  } {
    return {
      genreIds: this.uniqueIds(
        movie.genres?.map(genre => Number(genre.id)),
      ).sort((left, right) => left - right),
      countryIds: this.uniqueIds(
        movie.countries?.map(country => Number(country.id)),
      ).sort((left, right) => left - right),
      peopleIds: this.uniqueIds(
        movie.moviePeoples?.map(moviePeople => Number(moviePeople.people?.id)),
      ).sort((left, right) => left - right),
    };
  }

  /** So sánh ảnh AI trước/sau commit: scalar + 3 mảng ID đã sort. */
  private hasAiChanges(before: Movie, after: Movie): boolean {
    const scalarFields = [
      'title',
      'titleVi',
      'overview',
      'overviewVi',
    ] as const;
    if (scalarFields.some(field => before[field] !== after[field])) {
      return true;
    }

    const beforeIds = this.getCurrentRelationIds(before);
    const afterIds = this.getCurrentRelationIds(after);
    return (
      !this.sameIds(beforeIds.genreIds, afterIds.genreIds) ||
      !this.sameIds(beforeIds.countryIds, afterIds.countryIds) ||
      !this.sameIds(beforeIds.peopleIds, afterIds.peopleIds)
    );
  }

  private async validateIdList(
    ids: number[] | undefined,
    entity: EntityTarget<{ id: number }>,
    label: string,
  ): Promise<void> {
    const uniqueIds = this.uniqueIds(ids);
    if (uniqueIds.length === 0) return;

    const existing = await this.dataSource.getRepository(entity).find({
      where: { id: In(uniqueIds) },
      select: { id: true },
    });
    const existingIds = new Set(existing.map(item => Number(item.id)));
    const missing = uniqueIds.filter(id => !existingIds.has(id));
    if (missing.length > 0) {
      throw new BadRequestException(
        `${label} không tồn tại: ${missing.join(', ')}`,
      );
    }
  }

  private async validateRelations(dto: any) {
    await this.validateIdList(dto?.genreIds, Genre, 'Một hoặc nhiều thể loại');
    await this.validateIdList(
      dto?.countryIds,
      Country,
      'Một hoặc nhiều quốc gia',
    );
    await this.validateIdList(
      dto?.peopleIds,
      People,
      'Một hoặc nhiều nhân vật',
    );
  }

  private sameIds(next: number[], current: number[]): boolean {
    const normalize = (ids: number[]) =>
      this.uniqueIds(ids)
        .map(Number)
        .sort((left, right) => left - right);
    const left = normalize(next);
    const right = normalize(current);
    return (
      left.length === right.length &&
      left.every((id, index) => id === right[index])
    );
  }

  async testMovieCreated(createMovieDto: CreateMovieDto) {
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
      await this.movieProducer.publishMovieCreated(payload);
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
        await this.movieProducer.publishMovieCreated(payload);
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
    const relations = this.extractRelationIds(createMovieDto);
    const saved = await this.repo.createWithRelations(entity, relations);

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
      await this.movieProducer.publishMovieCreated(payload);
    }

    // Làm mới version danh sách phim.
    await this.cache.incr(CacheKeys.movie.listVersion());

    this.logger.log(
      `Tạo phim thành công: movieId=${saved.id}, fields=[${Object.keys(createMovieDto).join(',')}]`,
    );

    return saved;
  }

  async findAll(request: BaseSearchRequest): Promise<PaginatedResult<Movie>> {
    const { page = 1, limit = 10, keyword, filters = [], sort } = request;

    // Chỉ cache truy vấn mặc định (không filter, sort mặc định) ở trang <= MAX_CACHED_PAGE.
    const isDefaultQuery =
      (filters?.length ?? 0) === 0 &&
      (!sort || sort.join(',') === 'createdAt:DESC');

    if (!isDefaultQuery || page > MAX_CACHED_PAGE) {
      return this.repo.findAll(request);
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
        const rs = await this.repo.findAll(request);
        return {
          ...rs,
          data: rs.data.map(movie => ({
            ...movie,
            id: idUtil.toSafeNumberId(movie.id),
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
        return { ...movie, id: idUtil.toSafeNumberId(movie.id) };
      },
    });
  }

  async update(id: number, updateMovieDto: UpdateMovieDto) {
    const movie = await this.findOneFresh(id); // Kiểm tra tồn tại (đọc DB)
    await this.validateRelations(updateMovieDto);
    const entity = this.mapDtoToEntity(updateMovieDto);
    const relations = this.extractRelationIds(updateMovieDto);
    const updated = await this.repo.updateWithRelations(
      movie.id,
      entity,
      relations,
    );
    if (!updated) {
      throw new NotFoundException(`Không tìm thấy phim với ID ${id}`);
    }

    // Sau commit reload đủ quan hệ rồi mới so sánh trước/sau để phát event AI.
    const fullMovie = await this.repo.findById(updated.id);
    if (fullMovie && this.hasAiChanges(movie, fullMovie)) {
      const payload: MovieUpdatedPayload = {
        movieId: fullMovie.id,
        title: fullMovie.title,
        titleVi: fullMovie.titleVi,
        overview: fullMovie.overview,
        overviewVi: fullMovie.overviewVi,
        genres: fullMovie.genres?.map(g => g.name) || [],
      };
      await this.movieProducer.publishMovieUpdated(payload);
    }

    await this.invalidateAfterMovieChange(id);

    this.logger.log(
      `Cập nhật phim: movieId=${id}, fields=[${Object.keys(updateMovieDto).join(',')}]`,
    );

    return fullMovie ?? updated;
  }

  async remove(id: number) {
    const movie = await this.findOneFresh(id); // Kiểm tra tồn tại (đọc DB)
    await this.repo.remove(movie.id);

    await this.movieProducer.publishMovieDeleted({ movieId: id });

    await this.invalidateAfterMovieChange(id);

    this.logger.log(`Xoá phim: movieId=${id}`);

    return { success: true };
  }

  /** Xoá cache chi tiết phim và tăng version list/recommendation. */
  private async invalidateAfterMovieChange(movieId: number): Promise<void> {
    await this.cache.del(CacheKeys.movie.detail(movieId));
    await this.cache.incr(CacheKeys.movie.listVersion());
    await this.cache.incr(CacheKeys.recommendation.similarVersion(movieId));
  }

  async incrementViewCount(
    id: number,
    userId?: string,
    genres?: Array<{ id: number; name: string }>,
  ) {
    const movie = await this.findOneFresh(id);
    const stats = await this.statsService.recordView(id);
    const viewCount = stats.viewCount;

    const {
      score,
      interaction: interactionState,
      createdInteraction,
    } = await this.dataSource.transaction(async manager => {
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

    const numericMovieId = Number(movie.id);
    this.eventsGateway.broadcastViewCount(numericMovieId, viewCount);

    if (userId && interactionState !== 'none') {
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
      await this.interactionProducer.publishInteractionCreated({
        userId,
        movieId: numericMovieId,
        action: InteractionType.CLICK,
        score: null, // không cần score
        removed: false,
        createdAt: new Date(),
      });

      if (genres && genres.length > 0) {
        await this.userProducer.publishUserGenreUpdate(
          {
            type: InteractionType.CLICK,
            genres: genres.map(genre => ({ id: genre.id, name: genre.name })),
            score: InteractionScoreMap[InteractionType.CLICK],
          },
          undefined,
          userId,
        );
      }
    }

    return {
      viewCount,
      score,
      interaction: interactionState,
    };
  }

  /**
   * Tìm kiếm phim nâng cao bằng DB/cache.
   * Đọc cache theo version/page/limit, loader fallback về DB, sau đó tự phát event search nếu đủ điều kiện.
   * @returns ResultWithPagination<Movie> kèm event search đã được phát trong service.
   */
  async search(
    query: MovieSearchRequestDto,
    context?: SearchEventContext,
  ): Promise<ResultWithPagination<Movie>> {
    const { page = 1, limit = 10, keyword } = query;

    if (page > MAX_CACHED_PAGE) {
      const result = await this.searchFromDb(query);
      await this.publishSearchIfEligible(
        context,
        keyword ?? '',
        'db',
        result.result?.length ?? 0,
      );
      return result;
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

    const result = await this.cache.getOrLoad<ResultWithPagination<Movie>>({
      key,
      schema: MovieSearchCacheSchema,
      ttlSeconds: ttl,
      loader: async () => {
        const rs = await this.searchFromDb(query);

        return {
          ...rs,
          result: rs.result.map(movie => ({
            ...movie,
            id: idUtil.toSafeNumberId(movie.id),
          })),
        };
      },
    });

    await this.publishSearchIfEligible(
      context,
      keyword ?? '',
      'db',
      result.result?.length ?? 0,
    );
    return result;
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

    // keyword search: title, titleVi
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

    const sortMap = {
      viewCount: 'movie.viewCount',
      likeCount: 'movie.likeCount',
      releaseDate: 'movie.releaseDate',
      createdAt: 'movie.createdAt',
      voteAverage: 'movie.voteAverage',
    };
    const sortOptions = SearchUtils.parseSort(sort, Object.keys(sortMap));
    this.logger.log(`Parsed sort options: ${JSON.stringify(sortOptions)}`);

    for (const option of sortOptions) {
      const column = sortMap[option.field] as string | undefined;
      if (!column) {
        throw new BadRequestException(
          `Sort field không hợp lệ: ${option.field}`,
        );
      }
      queryBuilder.addOrderBy(column, option.direction);
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

  /** Hydration cache-first cho semantic/forYou. */
  async findByIdsCached(ids: number[]): Promise<Movie[]> {
    if (!ids || ids.length === 0) return [];

    const uniqueIds = [...new Set(ids.map(Number))];
    let rawValues: (string | null)[] = [];
    try {
      rawValues = await this.redis.mget(uniqueIds.map(CacheKeys.movie.detail));
    } catch (error) {
      this.logger.warn(
        `MGET cache chi tiết phim thất bại, dùng DB: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const cached: Movie[] = [];
    const missingIds: number[] = [];

    uniqueIds.forEach((id, index) => {
      const raw = rawValues[index];
      if (!raw) {
        missingIds.push(id);
        return;
      }

      try {
        const parsed = MovieDetailCacheSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          cached.push(parsed.data as unknown as Movie);
          return;
        }
      } catch {
        // Bỏ qua cache không parse được.
      }
      missingIds.push(id);
    });

    if (missingIds.length === 0) return cached;

    const fresh = await this.repo.findAllByIds(missingIds);
    for (const movie of fresh) {
      await this.cache.set(
        CacheKeys.movie.detail(Number(movie.id)),
        movie,
        CacheTtl.movieDetail,
      );
    }

    return [...cached, ...fresh];
  }

  /** Lấy all movie trong database và publish sự kiện tạo movie mới để đưa vào vector db và bm25 */
  async publishAllMoviesToQueue(maxRows: number | undefined): Promise<void> {
    this.logger.log('Publishing all movies to queue...');

    // theo từng batch và sleep 5s
    // batch size 500
    const batchSize = 500;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const movies = await this.repo.findAll({
        page: offset,
        limit: batchSize,
      });

      if (movies.data.length === 0) {
        hasMore = false;
        break;
      }

      for (const movie of movies.data) {
        if (movie) {
          const payload: MovieUpdatedPayload = {
            movieId: movie.id,
            title: movie.title,
            titleVi: movie.titleVi,
            overview: movie.overview,
            overviewVi: movie.overviewVi,
            genres: movie.genres?.map(g => g.name) || [],
          };
          await this.movieProducer.publishMovieUpdated(payload);
        }
      }

      offset += batchSize;
      this.logger.log(`Published ${offset} movies to queue...`);
      this.logger.log(`Sleeping for 5 seconds...`);

      await new Promise(resolve => setTimeout(resolve, 5000)); // Sleep 5s

      if (maxRows && offset >= maxRows) {
        this.logger.log(`Reached maxRows limit of ${maxRows}. Stopping.`);
        break;
      }
    }
  }
}
