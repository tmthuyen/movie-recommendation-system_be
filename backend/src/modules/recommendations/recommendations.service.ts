import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { AppException } from '@/common/custom-exception/app-exception';
import {
  ResultWithCursorPagination,
  ResultWithPagination,
} from '@/common/dtos/paginated-result.interface';
import {
  CursorQueryDto,
  DEFAULT_CURSOR_LIMIT,
  MAX_CURSOR_LIMIT,
} from '@/common/dtos/cursor-query.dto';
import {
  buildCursorPagination,
  buildCursorScope,
  clampCursorLimit,
  fingerprintIds,
  hydrateCursorPage,
  resolveCursorOffset,
} from '@/common/utils/cursor-pagination.util';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { MoviesService } from '@/modules/movies/movies.service';
import {
  HybridMovieResponseDto,
  SimilarMovieResponseDto,
} from '@/modules/recommendations/dtos/movie-response-with-score.dto';
import {
  HybridFromAiServiceResponseSchema,
  SimilarFromAiServiceResponse,
  SimilarFromAiServiceResponseSchema,
} from '@/modules/recommendations/interfaces/ai-service-response.interfaces';
import {
  CACHE_SERVICE,
  type ICacheService,
} from '@/infrastructure/cache/redis-cache.service';
import {
  CacheKeys,
  CacheTtl,
  RECOMMENDATION_WINDOW,
} from '@/infrastructure/cache/cache.keys';
import {
  RecommendationItemSchema,
  RecommendationSnapshotSchema,
} from '@/infrastructure/cache/cache.schemas';
import { RedisService } from '@/infrastructure/redis/redis.service';
import { z } from 'zod';

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || 'http://localhost:8082/api/recommendations';

/** Số gợi ý mặc định khi client không truyền `topK`. */
const DEFAULT_TOP_K = 10;

/** Tỉ lệ item tối thiểu còn tồn tại trong DB để dùng lại snapshot. */
const MAX_MISSING_RATIO = 0.3;

type RecommendationItem = z.infer<typeof RecommendationItemSchema>;

export const IRecommendationsService = Symbol('IRecommendationsService');
export interface IRecommendationsService {
  getSimilarMovies(
    movieId: number,
    topK?: number,
  ): Promise<ResultWithPagination<SimilarMovieResponseDto>>;
  getSimilarMoviesByCursor(
    movieId: number,
    query: CursorQueryDto,
  ): Promise<ResultWithCursorPagination<SimilarMovieResponseDto>>;
  semanticSearch(
    keyword: string,
    topK?: number,
  ): Promise<ResultWithPagination<SimilarMovieResponseDto>>;
  semanticSearchByCursor(
    keyword: string,
    query: CursorQueryDto,
  ): Promise<ResultWithCursorPagination<SimilarMovieResponseDto>>;
  hybridSearch(
    userId: string,
    accessToken: string,
    topK?: number,
  ): Promise<ResultWithPagination<HybridMovieResponseDto>>;
  hybridSearchByCursor(
    userId: string,
    accessToken: string,
    query: CursorQueryDto,
  ): Promise<ResultWithCursorPagination<HybridMovieResponseDto>>;
}
@Injectable()
export class RecommendationsService implements IRecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly window: number;

  constructor(
    private readonly movieService: MoviesService,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
    private readonly redis: RedisService,
  ) {
    this.window = RECOMMENDATION_WINDOW;
  }

  async getSimilarMovies(
    movieId: number,
    topK?: number,
  ): Promise<ResultWithPagination<SimilarMovieResponseDto>> {
    this.logger.log(`Lấy phim tương tự cho movieId=${movieId}, topK=${topK}`);

    // Kiểm tra phim tồn tại (throw 404 nếu không).
    await this.movieService.findOne(movieId);

    const requested = Math.min(
      Math.max(Number(topK) || DEFAULT_TOP_K, 1),
      this.window,
    );

    let { key, items } = await this.getSnapshot(movieId);
    let result = await this.hydrate(
      items.slice(0, requested),
      SimilarMovieResponseDto,
    );

    // Snapshot thiếu nhiều phim: xoá cache và tải lại một lần.
    const expected = Math.min(requested, items.length);
    if (expected > 0 && result.length < expected * (1 - MAX_MISSING_RATIO)) {
      await this.cache.del(key);
      ({ key, items } = await this.getSnapshot(movieId));
      result = await this.hydrate(
        items.slice(0, Math.min(requested, items.length)),
        SimilarMovieResponseDto,
      );
    }

    return {
      result,
      pagination: {
        page: 1,
        limit: requested,
        total: items.length,
        totalPages: 1,
      },
    };
  }

  async getSimilarMoviesByCursor(
    movieId: number,
    query: CursorQueryDto,
  ): Promise<ResultWithCursorPagination<SimilarMovieResponseDto>> {
    this.logger.log(
      `Lấy phim tương tự (cursor) cho movieId=${movieId}, limit=${query.limit}, cursor=${query.cursor ? 'yes' : 'no'}`,
    );

    await this.movieService.findOne(movieId);

    const limit = clampCursorLimit(
      query.limit,
      DEFAULT_CURSOR_LIMIT,
      MAX_CURSOR_LIMIT,
    );
    const { items, version, fingerprint } = await this.getSnapshot(movieId);
    const scope = buildCursorScope('similar', movieId);

    const offset = resolveCursorOffset(
      query.cursor,
      { version, scope, fingerprint },
      items.length,
    );

    const page = await hydrateCursorPage({
      items,
      offset,
      limit,
      hydrate: chunk => this.hydrate(chunk, SimilarMovieResponseDto),
    });

    return {
      result: page.result,
      pagination: buildCursorPagination({
        limit,
        total: items.length,
        offset: page.nextOffset,
        version,
        scope,
        fingerprint,
      }),
    };
  }

  async semanticSearch(
    keyword: string,
    topK?: number,
  ): Promise<ResultWithPagination<SimilarMovieResponseDto>> {
    this.logger.log(`Semantic search: keyword="${keyword}", topK=${topK}`);

    const requested = Math.min(
      Math.max(Number(topK) || DEFAULT_TOP_K, 1),
      this.window,
    );
    const key = `cache:recommendation:semantic:${encodeURIComponent(keyword)}:k${this.window}`;
    const { items, total } = await this.readWindow(
      key,
      () => this.loadSemanticFromAi(keyword),
      0,
      requested,
    );

    return {
      result: await this.hydrate(items, SimilarMovieResponseDto),
      pagination: { page: 1, limit: requested, total, totalPages: 1 },
    };
  }

  async semanticSearchByCursor(
    keyword: string,
    query: CursorQueryDto,
  ): Promise<ResultWithCursorPagination<SimilarMovieResponseDto>> {
    this.logger.log(
      `Semantic search (cursor): keyword="${keyword}", limit=${query.limit}, cursor=${query.cursor ?? 0}`,
    );

    const limit = clampCursorLimit(
      query.limit,
      DEFAULT_CURSOR_LIMIT,
      MAX_CURSOR_LIMIT,
    );
    const afterRank = Math.max(0, Number(query.cursor) || 0);
    const key = `cache:recommendation:semantic:${encodeURIComponent(keyword)}:k${this.window}`;
    const { items, total } = await this.readWindow(
      key,
      () => this.loadSemanticFromAi(keyword),
      afterRank,
      limit,
    );

    const lastRank =
      items.length > 0 ? items[items.length - 1].rank : afterRank;
    const hasMore = lastRank < total;

    return {
      result: await this.hydrate(items, SimilarMovieResponseDto),
      pagination: {
        limit,
        total,
        hasMore,
        nextCursor: hasMore ? lastRank : null,
      },
    };
  }

  async hybridSearch(
    userId: string,
    accessToken: string,
    topK?: number,
  ): Promise<ResultWithPagination<HybridMovieResponseDto>> {
    this.logger.log(`For-you: userId=${userId}, topK=${topK}`);

    const requested = Math.min(
      Math.max(Number(topK) || DEFAULT_TOP_K, 1),
      this.window,
    );
    const key = `cache:recommendation:for-you:${userId}:k${this.window}`;
    const { items, total } = await this.readWindow(
      key,
      () => this.loadForYouFromAi(accessToken),
      0,
      requested,
    );

    return {
      result: await this.hydrate(items, HybridMovieResponseDto),
      pagination: { page: 1, limit: requested, total, totalPages: 1 },
    };
  }

  async hybridSearchByCursor(
    userId: string,
    accessToken: string,
    query: CursorQueryDto,
  ): Promise<ResultWithCursorPagination<HybridMovieResponseDto>> {
    this.logger.log(
      `For-you (cursor): userId=${userId}, limit=${query.limit}, cursor=${query.cursor ?? 0}`,
    );

    const limit = clampCursorLimit(
      query.limit,
      DEFAULT_CURSOR_LIMIT,
      MAX_CURSOR_LIMIT,
    );
    const afterRank = Math.max(0, Number(query.cursor) || 0);
    const key = `cache:recommendation:for-you:${userId}:k${this.window}`;
    const { items, total } = await this.readWindow(
      key,
      () => this.loadForYouFromAi(accessToken),
      afterRank,
      limit,
    );

    const lastRank =
      items.length > 0 ? items[items.length - 1].rank : afterRank;
    const hasMore = lastRank < total;

    return {
      result: await this.hydrate(items, HybridMovieResponseDto),
      pagination: {
        limit,
        total,
        hasMore,
        nextCursor: hasMore ? lastRank : null,
      },
    };
  }

  /**
   * Đọc một trang từ Redis sorted set (score = rank).
   * Key chưa có → gọi loader một lần, ghi ZSET rồi đọc lại.
   */
  private async readWindow(
    key: string,
    loader: () => Promise<RecommendationItem[]>,
    afterRank: number,
    limit: number,
  ): Promise<{ items: RecommendationItem[]; total: number }> {
    let raw = await this.redis.zrangeByScore(
      key,
      `(${afterRank}`,
      '+inf',
      limit,
    );

    if (raw.length === 0 && (await this.redis.zcard(key)) === 0) {
      const items = await loader();
      await this.redis.zadd(
        key,
        items.map(item => ({
          score: item.rank,
          member: JSON.stringify(item),
        })),
        CacheTtl.recommendation,
      );
      raw = await this.redis.zrangeByScore(key, `(${afterRank}`, '+inf', limit);
    }

    return {
      items: raw.map(member =>
        RecommendationItemSchema.parse(JSON.parse(member)),
      ),
      total: await this.redis.zcard(key),
    };
  }

  private async callAiService<T>(
    path: string,
    schema: z.ZodType<T>,
    accessToken?: string,
  ): Promise<T> {
    const res = await fetch(`${AI_SERVICE_URL}${path}`, {
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    });

    if (!res.ok) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Lỗi khi gọi AI service',
        'The AI service returned an error.',
        'AI_SERVICE_ERROR',
      );
    }

    try {
      return schema.parse(await res.json());
    } catch (error) {
      this.logger.error(
        `Dữ liệu trả về không hợp lệ từ AI service: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Dữ liệu trả về không hợp lệ từ AI service',
        'The AI service did not return a valid response.',
        'AI_SERVICE_ERROR',
      );
    }
  }

  private async loadSemanticFromAi(
    keyword: string,
  ): Promise<RecommendationItem[]> {
    const raw = await this.callAiService(
      `/semantic-search?keyword=${encodeURIComponent(keyword)}&topK=${this.window}`,
      SimilarFromAiServiceResponseSchema,
    );

    return this.toSnapshot(
      raw.result.map(item => ({
        id: item.id,
        score: item.score ?? item.similarityScore,
      })),
    );
  }

  private async loadForYouFromAi(
    accessToken: string,
  ): Promise<RecommendationItem[]> {
    const raw = await this.callAiService(
      `/hybrid?topK=${this.window}`,
      HybridFromAiServiceResponseSchema,
      accessToken,
    );

    return this.toSnapshot(
      raw.result.map(item => ({
        id: item.id ?? item.movie_id,
        score: item.score ?? item.rrf_score,
      })),
    );
  }

  /** Khử trùng id, gán rank 1..n và cắt theo window. */
  private toSnapshot(
    items: Array<{ id: number; score: number }>,
  ): RecommendationItem[] {
    const seen = new Set<number>();
    const snapshot: RecommendationItem[] = [];

    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      snapshot.push({
        id: item.id,
        score: item.score,
        rank: snapshot.length + 1,
      });
      if (snapshot.length >= this.window) break;
    }

    return snapshot;
  }

  private async getSnapshot(movieId: number): Promise<{
    key: string;
    items: RecommendationItem[];
    version: number;
    fingerprint: string;
  }> {
    const version = await this.cache.getCounter(
      CacheKeys.recommendation.similarVersion(movieId),
    );
    const key = CacheKeys.recommendation.similar(movieId, this.window, version);

    const items = await this.cache.getOrLoad<RecommendationItem[]>({
      key,
      schema: RecommendationSnapshotSchema,
      ttlSeconds: CacheTtl.recommendation,
      loader: () => this.loadSnapshotFromAi(movieId, this.window),
    });

    return {
      key,
      items,
      version,
      fingerprint: fingerprintIds(items.map(item => item.id)),
    };
  }

  /** Lấy snapshot từ ai-service và chuẩn hoá `rank` về 1..n. */
  private async loadSnapshotFromAi(
    movieId: number,
    window: number,
  ): Promise<RecommendationItem[]> {
    const res = await fetch(
      `${AI_SERVICE_URL}/similar/${movieId}?topK=${window}`,
    );

    let parsedResponse: SimilarFromAiServiceResponse;
    try {
      const raw = await res.json();
      // this.logger.log(
      //   `Dữ liệu trả về từ AI service (status=${res.status}): ${JSON.stringify(raw)}`,
      // );

      parsedResponse = SimilarFromAiServiceResponseSchema.parse(raw);
    } catch (error) {
      this.logger.error(
        `Dữ liệu trả về không hợp lệ từ AI service (status=${res.status}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Dữ liệu trả về phim liên quan không hợp lệ từ AI service',
        'The AI service did not return a valid response for similar movies.',
        'AI_SERVICE_ERROR',
      );
    }

    if (!parsedResponse || !parsedResponse.result) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Dữ liệu trả về không hợp lệ từ AI service',
        'The AI service did not return a valid response for similar movies.',
        'AI_SERVICE_ERROR',
      );
    }

    const seen = new Set<number>();
    const snapshot: RecommendationItem[] = [];
    for (const item of parsedResponse.result) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      snapshot.push({
        id: item.id,
        score: item.similarityScore,
        rank: snapshot.length + 1,
      });
    }

    return snapshot;
  }

  /** Ghép id trong snapshot với dữ liệu phim trong DB. */
  private async hydrate<T>(
    items: RecommendationItem[],
    dtoClass: new () => T,
  ): Promise<T[]> {
    if (items.length === 0) return [];

    const itemIds = items.map(item => item.id);

    const movies = await this.movieService.findByIds(itemIds);

    this.logger.log(`
      Số phim trong snapshot: ${items.length}, số phim tìm thấy trong DB: ${movies.length}`);

    const movieById = new Map<number, Movie>();
    for (const movie of movies) {
      movieById.set(Number(movie.id), movie);
    }

    const mappedData = items
      .map(item => {
        const movie = movieById.get(Number(item.id));

        if (!movie) {
          this.logger.warn(
            `Movie with id ${item.id} not found in database, skipping.`,
          );
          return null;
        }
        return {
          ...movie,
          score: item.score,
          rank: item.rank,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return plainToInstance(dtoClass, mappedData, {
      excludeExtraneousValues: true,
    });
  }
}
