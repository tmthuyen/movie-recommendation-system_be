import { AppException } from '@/common/custom-exception/app-exception';
import { ResultWithPagination } from '@/common/dtos/paginated-result.interface';
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
  semanticSearch(keyword: string, topK?: number): Promise<any>;
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

  async semanticSearch(keyword: string, topK?: number): Promise<any> {}

  async hybridSearch(hybridSearchQuery: HybridSearchQuery): Promise<any> {}

  private async getSnapshot(
    movieId: number,
  ): Promise<{ key: string; items: RecommendationItem[] }> {
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

    return { key, items };
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
      //  check type of movie.id
      let id = movie.id;
      if (typeof movie.id !== 'number') {
        id = Number(movie.id);
      }
      movieById.set(id, movie);
    }

    this.logger.log(`
      item.id: ${items[0]?.id} - type: ${typeof items[0]?.id}
      movie.id: ${movies[0]?.id} - type: ${typeof movies[0]?.id}
    `);

    this.logger.log(`
      Movie Rec: ${itemIds.join(', ')}\n
      Movie DB: ${movies.map(m => m.id).join(', ')}\n
      Movie Map: ${Array.from(movieById.keys()).join(', ')}
      `);

    const mappedData = items
      .map(item => {
        const movie = movieById.get(Number(item.id));
        this.logger.log(
          `Mapping movieId=${item.id} to movie=${movie?.title || 'null'}`,
        );
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
