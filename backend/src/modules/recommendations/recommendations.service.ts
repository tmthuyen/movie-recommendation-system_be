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
} from '@/common/utlils/cursor-pagination.util';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { MoviesService } from '@/modules/movies/movies.service';
import { HybridSearchQuery } from '@/modules/recommendations/dtos/hybrid-search-query.dto';
import { SimilarMovieResponseDto } from '@/modules/recommendations/dtos/movie-response-with-score.dto';
import {
  SimilarFromAiServiceResponse,
  SimilarFromAiServiceResponseSchema,
} from '@/modules/recommendations/interfaces/ai-service-response.interfaces';
import { ConfigService } from '@nestjs/config';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ICacheService } from '@/infrastructure/cache/redis-cache.service';
import {
  CacheKeys,
  CacheTtl,
  RECOMMENDATION_WINDOW,
} from '@/infrastructure/cache/cache.keys';
import {
  RecommendationItemSchema,
  RecommendationSnapshotSchema,
} from '@/infrastructure/cache/cache.schemas';
import { createHash } from 'crypto';
import { z } from 'zod';

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || 'http://localhost:8082/api/recommendations';

/** Số gợi ý mặc định khi client không truyền `topK`. */
const DEFAULT_TOP_K = 10;

/** Tỉ lệ item tối thiểu còn tồn tại trong DB để dùng lại snapshot. */
const MAX_MISSING_RATIO = 0.3;

type RecommendationItem = z.infer<typeof RecommendationItemSchema>;

function hashKeyword(keyword: string): string {
  return createHash('sha1')
    .update(keyword.trim().toLowerCase())
    .digest('hex')
    .slice(0, 12);
}

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
  searchLexicalSemanticRerank(
    keyword: string,
    topK?: number,
  ): Promise<ResultWithPagination<SimilarMovieResponseDto>>;
  searchLexicalSemanticRerankByCursor(
    keyword: string,
    query: CursorQueryDto,
  ): Promise<ResultWithCursorPagination<SimilarMovieResponseDto>>;
  hybridSearch(hybridSearchQuery: HybridSearchQuery): Promise<any>;
}

@Injectable()
export class RecommendationsService implements IRecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  private readonly window: number;

  constructor(
    private readonly movieService: MoviesService,
    @Inject(ICacheService) private readonly cache: ICacheService,
    config: ConfigService,
  ) {
    const configured = Number(config.get<string>('RECOMMENDATION_WINDOW'));
    this.window =
      Number.isFinite(configured) && configured > 0
        ? configured
        : RECOMMENDATION_WINDOW;
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
    let page = await this.hydrate(items.slice(0, requested));

    // Snapshot thiếu nhiều phim: xoá cache và tải lại một lần.
    const expected = Math.min(requested, items.length);
    if (
      expected > 0 &&
      page.result.length < expected * (1 - MAX_MISSING_RATIO)
    ) {
      await this.cache.del(key);
      ({ key, items } = await this.getSnapshot(movieId));
      page = await this.hydrate(
        items.slice(0, Math.min(requested, items.length)),
      );
    }

    return {
      result: page.result,
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
      hydrate: async chunk => (await this.hydrate(chunk)).result,
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
    const cleanKeyword = (keyword ?? '').trim();
    if (!cleanKeyword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Từ khóa tìm kiếm không được để trống.',
        'Keyword must not be empty.',
        'INVALID_KEYWORD',
      );
    }

    const requested = Math.min(
      Math.max(Number(topK) || DEFAULT_TOP_K, 1),
      this.window,
    );

    let { key, items } = await this.getSemanticSnapshot(cleanKeyword);
    let page = await this.hydrate(items.slice(0, requested));

    const expected = Math.min(requested, items.length);
    if (
      expected > 0 &&
      page.result.length < expected * (1 - MAX_MISSING_RATIO)
    ) {
      await this.cache.del(key);
      ({ key, items } = await this.getSemanticSnapshot(cleanKeyword));
      page = await this.hydrate(
        items.slice(0, Math.min(requested, items.length)),
      );
    }

    return {
      result: page.result,
      pagination: {
        page: 1,
        limit: requested,
        total: items.length,
        totalPages: items.length > 0 ? 1 : 0,
      },
    };
  }

  async semanticSearchByCursor(
    keyword: string,
    query: CursorQueryDto,
  ): Promise<ResultWithCursorPagination<SimilarMovieResponseDto>> {
    const cleanKeyword = (keyword ?? '').trim();
    if (!cleanKeyword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Từ khóa tìm kiếm không được để trống.',
        'Keyword must not be empty.',
        'INVALID_KEYWORD',
      );
    }

    const limit = clampCursorLimit(
      query.limit,
      DEFAULT_CURSOR_LIMIT,
      MAX_CURSOR_LIMIT,
    );
    const { items, version, fingerprint } =
      await this.getSemanticSnapshot(cleanKeyword);
    const scope = buildCursorScope('semantic', hashKeyword(cleanKeyword));

    const offset = resolveCursorOffset(
      query.cursor,
      { version, scope, fingerprint },
      items.length,
    );

    const page = await hydrateCursorPage({
      items,
      offset,
      limit,
      hydrate: async chunk => (await this.hydrate(chunk)).result,
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

  async searchLexicalSemanticRerank(
    keyword: string,
    topK?: number,
  ): Promise<ResultWithPagination<SimilarMovieResponseDto>> {
    const cleanKeyword = (keyword ?? '').trim();
    if (!cleanKeyword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Từ khóa tìm kiếm không được để trống.',
        'Keyword must not be empty.',
        'INVALID_KEYWORD',
      );
    }

    const requested = Math.min(
      Math.max(Number(topK) || DEFAULT_TOP_K, 1),
      this.window,
    );

    let { key, items } = await this.getLexicalRerankSnapshot(cleanKeyword);
    let page = await this.hydrate(items.slice(0, requested));

    const expected = Math.min(requested, items.length);
    if (
      expected > 0 &&
      page.result.length < expected * (1 - MAX_MISSING_RATIO)
    ) {
      await this.cache.del(key);
      ({ key, items } = await this.getLexicalRerankSnapshot(cleanKeyword));
      page = await this.hydrate(
        items.slice(0, Math.min(requested, items.length)),
      );
    }

    return {
      result: page.result,
      pagination: {
        page: 1,
        limit: requested,
        total: items.length,
        totalPages: items.length > 0 ? 1 : 0,
      },
    };
  }

  async searchLexicalSemanticRerankByCursor(
    keyword: string,
    query: CursorQueryDto,
  ): Promise<ResultWithCursorPagination<SimilarMovieResponseDto>> {
    const cleanKeyword = (keyword ?? '').trim();
    if (!cleanKeyword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Từ khóa tìm kiếm không được để trống.',
        'Keyword must not be empty.',
        'INVALID_KEYWORD',
      );
    }

    const limit = clampCursorLimit(
      query.limit,
      DEFAULT_CURSOR_LIMIT,
      MAX_CURSOR_LIMIT,
    );
    const { items, version, fingerprint } =
      await this.getLexicalRerankSnapshot(cleanKeyword);
    const scope = buildCursorScope(
      'lexical-rerank',
      hashKeyword(cleanKeyword),
    );

    const offset = resolveCursorOffset(
      query.cursor,
      { version, scope, fingerprint },
      items.length,
    );

    const page = await hydrateCursorPage({
      items,
      offset,
      limit,
      hydrate: async chunk => (await this.hydrate(chunk)).result,
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

  async hybridSearch(hybridSearchQuery: HybridSearchQuery): Promise<any> {
    if (hybridSearchQuery?.keyword) {
      return this.searchLexicalSemanticRerank(
        hybridSearchQuery.keyword,
        hybridSearchQuery.topK,
      );
    }
    return {
      result: [],
      pagination: {
        page: hybridSearchQuery?.page ?? 1,
        limit: hybridSearchQuery?.pageSize ?? DEFAULT_TOP_K,
        total: 0,
        totalPages: 0,
      },
    };
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

  private async getSemanticSnapshot(keyword: string): Promise<{
    key: string;
    items: RecommendationItem[];
    version: number;
    fingerprint: string;
  }> {
    const version = await this.cache.getCounter(CacheKeys.movie.listVersion());
    const key = CacheKeys.recommendation.semantic(
      keyword,
      this.window,
      version,
    );

    const items = await this.cache.getOrLoad<RecommendationItem[]>({
      key,
      schema: RecommendationSnapshotSchema,
      ttlSeconds: CacheTtl.recommendation,
      loader: () => this.loadSemanticSnapshotFromAi(keyword, this.window),
    });

    return {
      key,
      items,
      version,
      fingerprint: fingerprintIds(items.map(item => item.id)),
    };
  }

  private async getLexicalRerankSnapshot(keyword: string): Promise<{
    key: string;
    items: RecommendationItem[];
    version: number;
    fingerprint: string;
  }> {
    const version = await this.cache.getCounter(CacheKeys.movie.listVersion());
    const key = CacheKeys.recommendation.lexicalRerank(
      keyword,
      this.window,
      version,
    );

    const items = await this.cache.getOrLoad<RecommendationItem[]>({
      key,
      schema: RecommendationSnapshotSchema,
      ttlSeconds: CacheTtl.recommendation,
      loader: () => this.loadLexicalRerankSnapshotFromAi(keyword, this.window),
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
    return this.parseAiSnapshotResponse(
      res,
      'Dữ liệu trả về phim liên quan không hợp lệ từ AI service',
      'The AI service did not return a valid response for similar movies.',
    );
  }

  /** Lấy snapshot semantic search từ ai-service. */
  private async loadSemanticSnapshotFromAi(
    keyword: string,
    window: number,
  ): Promise<RecommendationItem[]> {
    const url = `${AI_SERVICE_URL}/semantic-search?keyword=${encodeURIComponent(
      keyword,
    )}&topK=${window}`;
    const res = await fetch(url);
    return this.parseAiSnapshotResponse(
      res,
      'Dữ liệu trả về tìm kiếm ngữ nghĩa không hợp lệ từ AI service',
      'The AI service did not return a valid response for semantic search.',
    );
  }

  /** Tìm ứng viên Lexical từ PostgreSQL rồi gửi sang AI-Service rerank với Semantic. */
  private async loadLexicalRerankSnapshotFromAi(
    keyword: string,
    window: number,
  ): Promise<RecommendationItem[]> {
    let lexicalIds: number[] = [];
    if (typeof (this.movieService as any).search === 'function') {
      try {
        const lexRes = await (this.movieService as any).search({
          keyword,
          page: 1,
          limit: Math.min(window, 50),
          sort: 'releaseDate:DESC',
        });
        if (lexRes && Array.isArray(lexRes.result)) {
          lexicalIds = lexRes.result
            .map((m: { id: number }) => Number(m.id))
            .filter((id: number) => Number.isFinite(id) && id > 0);
        }
      } catch (err) {
        this.logger.warn(
          `Không thể lấy lexical candidates từ PostgreSQL cho keyword="${keyword}": ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const res = await fetch(`${AI_SERVICE_URL}/search/rerank`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keyword,
        lexicalIds,
        topK: window,
        candidateK: window,
      }),
    });

    return this.parseAiSnapshotResponse(
      res,
      'Dữ liệu trả về rerank tìm kiếm không hợp lệ từ AI service',
      'The AI service did not return a valid response for lexical-semantic rerank.',
    );
  }

  private async parseAiSnapshotResponse(
    res: Response,
    viMessage: string,
    enMessage: string,
  ): Promise<RecommendationItem[]> {
    let parsedResponse: SimilarFromAiServiceResponse;
    try {
      const raw = await res.json();
      parsedResponse = SimilarFromAiServiceResponseSchema.parse(raw);
    } catch (error) {
      this.logger.error(
        `Dữ liệu trả về không hợp lệ từ AI service (status=${res.status}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        viMessage,
        enMessage,
        'AI_SERVICE_ERROR',
      );
    }

    if (!parsedResponse || !parsedResponse.result) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Dữ liệu trả về không hợp lệ từ AI service',
        enMessage,
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
  private async hydrate(items: RecommendationItem[]): Promise<{
    result: SimilarMovieResponseDto[];
  }> {
    if (items.length === 0) return { result: [] };

    const itemIds = items.map(item => item.id);

    const movies = await this.movieService.findByIds(itemIds);

    this.logger.log(`
      Số phim trong snapshot: ${items.length}, số phim tìm thấy trong DB: ${movies.length}`);

    const movieById = new Map<number, Movie>();
    for (const movie of movies) {
      let id = movie.id;
      if (typeof movie.id !== 'number') {
        id = Number(movie.id);
      }
      movieById.set(id, movie);
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
          similarityScore: item.score,
          rank: item.rank,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const result = plainToInstance(SimilarMovieResponseDto, mappedData, {
      excludeExtraneousValues: true,
    });

    return { result };
  }
}
