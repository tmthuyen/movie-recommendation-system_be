import { Inject, Injectable, Logger } from '@nestjs/common';
import { CacheKeys, CacheTtl } from '@/infrastructure/cache/cache.keys';
import {
  HotMovieSchema,
  InteractionStatsCacheSchema,
} from '@/infrastructure/cache/cache.schemas';
import { REDIS_SERVICE } from '@/infrastructure/redis/redis.service';
import type { IRedisService } from '@/infrastructure/redis/redis.service';

export interface MovieInteractionStats {
  likeCount: number;
  commentCount: number;
  viewCount: number;
  ratingCount: number;
  voteAverage: number;
  ratingTotal: number;
  ratingAvg: number;
}

export interface HotMovie {
  movieId: number;
  score: number;
}

export type StatsPeriod = 'all' | 'day' | 'week' | 'month';
export type StatsMetric = 'view' | 'like' | 'comment' | 'rating';

/** TTL các bucket ZSET (giây). */
const ZSET_TTL_SECONDS = {
  all: 365 * 24 * 60 * 60,
  day: 2 * 24 * 60 * 60,
  week: 14 * 24 * 60 * 60,
  month: 45 * 24 * 60 * 60,
} as const;

const ZERO_STATS: MovieInteractionStats = {
  likeCount: 0,
  commentCount: 0,
  viewCount: 0,
  ratingCount: 0,
  voteAverage: 0,
  ratingTotal: 0,
  ratingAvg: 0,
};

/** Đọc và cập nhật stats phim trong Redis. */
@Injectable()
export class MovieInteractionStatsService {
  private readonly logger = new Logger(MovieInteractionStatsService.name);

  constructor(@Inject(REDIS_SERVICE) private readonly redis: IRedisService) {}

  async getStats(movieId: number): Promise<MovieInteractionStats> {
    const hash = await this.redis.hgetall(CacheKeys.stats.detail(movieId));
    const parsed = this.parseHash(hash);
    if (parsed) return parsed;

    await this.ensureStats(movieId);
    return { ...ZERO_STATS };
  }

  async recordView(movieId: number): Promise<MovieInteractionStats> {
    await this.ensureStats(movieId);
    const key = CacheKeys.stats.detail(movieId);
    const viewCount = await this.redis.hincrby(key, 'viewCount', 1);
    if (viewCount < 0)
      await this.redis.hset(key, { viewCount: '0' }, CacheTtl.statsDetail);

    await this.bumpAllRankings(movieId, 'view', 1);
    await this.markDirty(movieId);
    return this.getStats(movieId);
  }

  async recordLike(
    movieId: number,
    delta: 1 | -1,
  ): Promise<MovieInteractionStats> {
    await this.ensureStats(movieId);
    const key = CacheKeys.stats.detail(movieId);
    const likeCount = await this.redis.hincrby(key, 'likeCount', delta);
    if (likeCount < 0) {
      await this.redis.hset(key, { likeCount: '0' }, CacheTtl.statsDetail);
    }

    await this.bumpAllRankings(movieId, 'like', delta);
    await this.markDirty(movieId);
    return this.getStats(movieId);
  }

  async recordComment(
    movieId: number,
    delta: 1 | -1,
  ): Promise<MovieInteractionStats> {
    await this.ensureStats(movieId);
    const key = CacheKeys.stats.detail(movieId);
    const commentCount = await this.redis.hincrby(key, 'commentCount', delta);
    if (commentCount < 0) {
      await this.redis.hset(key, { commentCount: '0' }, CacheTtl.statsDetail);
    }

    await this.bumpAllRankings(movieId, 'comment', delta);
    await this.markDirty(movieId);
    return this.getStats(movieId);
  }

  /** deltaCount = +1 khi rating mới, 0 khi update; deltaTotal = newScore - oldScore. */
  async recordRating(
    movieId: number,
    deltaCount: 0 | 1,
    deltaTotal: number,
  ): Promise<MovieInteractionStats> {
    await this.ensureStats(movieId);
    const key = CacheKeys.stats.detail(movieId);
    const ratingCount = Math.max(
      0,
      await this.redis.hincrby(key, 'ratingCount', deltaCount),
    );
    const ratingTotal = Math.max(
      0,
      await this.redis.hincrby(key, 'ratingTotal', deltaTotal),
    );
    const ratingAvg =
      ratingCount > 0 ? Number((ratingTotal / ratingCount).toFixed(2)) : 0;

    await this.redis.hset(
      key,
      {
        ratingCount: String(ratingCount),
        ratingTotal: String(ratingTotal),
        ratingAvg: String(ratingAvg),
        voteAverage: String(ratingAvg),
      },
      CacheTtl.statsDetail,
    );

    await this.bumpAllRankings(movieId, 'rating', deltaCount, ratingAvg);
    await this.markDirty(movieId);
    return this.getStats(movieId);
  }

  /** Ghi số liệu rating đã tính từ DB vào Redis. */
  async setRatingStats(
    movieId: number,
    ratingCount: number,
    ratingAvg: number,
  ): Promise<MovieInteractionStats> {
    const previous = await this.getStats(movieId);
    const count = Math.max(0, Math.trunc(ratingCount) || 0);
    const average = Math.min(10, Math.max(0, Number(ratingAvg) || 0));
    const ratingTotal = count > 0 ? Number((average * count).toFixed(2)) : 0;
    const normalizedAvg =
      count > 0 ? Number((ratingTotal / count).toFixed(2)) : 0;

    await this.redis.hset(
      CacheKeys.stats.detail(movieId),
      {
        ratingCount: String(count),
        ratingTotal: String(ratingTotal),
        ratingAvg: String(normalizedAvg),
        voteAverage: String(normalizedAvg),
      },
      CacheTtl.statsDetail,
    );

    await this.bumpAllRankings(
      movieId,
      'rating',
      count - previous.ratingCount,
      normalizedAvg,
    );
    await this.markDirty(movieId);
    return this.getStats(movieId);
  }

  async getRanking(
    type: 'popular' | 'hot' | 'top',
    metricOrPeriod: StatsMetric | StatsPeriod,
    period: StatsPeriod,
    limit: number,
  ): Promise<HotMovie[]> {
    const key = this.rankingKey(type, metricOrPeriod, period);
    const rows = await this.redis.zrevrangeWithScores(key, 0, limit - 1);
    return rows.map(row =>
      HotMovieSchema.parse({ movieId: Number(row.member), score: row.score }),
    );
  }

  /** Nạp stats từ DB vào Redis. */
  async seedFromDb(
    stats: Array<MovieInteractionStats & { movieId: number }>,
  ): Promise<void> {
    for (const item of stats) {
      await this.redis.hset(
        CacheKeys.stats.detail(item.movieId),
        this.toHashFields(item),
        CacheTtl.statsDetail,
      );
      await this.redis.zincrby(
        CacheKeys.stats.popular(),
        item.viewCount + item.likeCount + item.commentCount + item.ratingCount,
        String(item.movieId),
        ZSET_TTL_SECONDS.all,
      );
    }
  }

  /** Trả danh sách phim cần đồng bộ. */
  async listDirtyMovieIds(): Promise<number[]> {
    const rows = await this.redis.smembers(CacheKeys.stats.dirty());
    return rows.map(Number).filter(id => Number.isFinite(id));
  }

  async clearDirty(movieId: number): Promise<void> {
    await this.redis.srem(CacheKeys.stats.dirty(), String(movieId));
  }

  private rankingKey(
    type: 'popular' | 'hot' | 'top',
    metricOrPeriod: StatsMetric | StatsPeriod,
    period: StatsPeriod,
  ): string {
    if (type === 'popular') return CacheKeys.stats.popular();
    if (type === 'hot') {
      return CacheKeys.stats.hot(
        this.currentPeriodKey(String(metricOrPeriod) as StatsPeriod),
      );
    }
    return CacheKeys.stats.top(
      String(metricOrPeriod),
      this.currentPeriodKey(period),
    );
  }

  private currentPeriodKey(period: StatsPeriod): string {
    if (period === 'all') return 'all';

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');

    if (period === 'day') return `${year}-${month}-${day}`;
    if (period === 'month') return `${year}-${month}`;

    const utc = new Date(Date.UTC(year, now.getMonth(), now.getDate()));
    const weekDay = utc.getUTCDay() || 7;
    utc.setUTCDate(utc.getUTCDate() + 4 - weekDay);
    const isoYear = utc.getUTCFullYear();
    const yearStart = new Date(Date.UTC(isoYear, 0, 1));
    const week = Math.ceil(
      ((utc.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7,
    );
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
  }

  private async bumpAllRankings(
    movieId: number,
    metric: StatsMetric,
    delta: number,
    ratingAvg = 0,
  ): Promise<void> {
    const member = String(movieId);
    const periods: StatsPeriod[] = ['all', 'day', 'week', 'month'];

    await this.redis.zincrby(
      CacheKeys.stats.popular(),
      delta,
      member,
      ZSET_TTL_SECONDS.all,
    );

    await Promise.all(
      periods.map(async period => {
        const bucket = this.currentPeriodKey(period);
        await this.redis.zincrby(
          CacheKeys.stats.hot(bucket),
          delta,
          member,
          ZSET_TTL_SECONDS[period],
        );
        if (metric === 'rating') {
          await this.redis.zaddMax(
            CacheKeys.stats.top('rating', bucket),
            ratingAvg * 10,
            member,
            ZSET_TTL_SECONDS[period],
          );
        } else {
          await this.redis.zincrby(
            CacheKeys.stats.top(metric, bucket),
            delta,
            member,
            ZSET_TTL_SECONDS[period],
          );
        }
      }),
    );
  }

  private async ensureStats(movieId: number): Promise<void> {
    await this.redis.hsetIfAbsent(
      CacheKeys.stats.detail(movieId),
      this.toHashFields(ZERO_STATS),
      CacheTtl.statsDetail,
    );
  }

  private async markDirty(movieId: number): Promise<void> {
    await this.redis.sadd(
      CacheKeys.stats.dirty(),
      String(movieId),
      24 * 60 * 60,
    );
  }

  private toHashFields(stats: MovieInteractionStats): Record<string, string> {
    return {
      likeCount: String(stats.likeCount),
      commentCount: String(stats.commentCount),
      viewCount: String(stats.viewCount),
      ratingCount: String(stats.ratingCount),
      voteAverage: String(stats.voteAverage),
      ratingTotal: String(stats.ratingTotal),
      ratingAvg: String(stats.ratingAvg),
    };
  }

  private parseHash(
    hash: Record<string, string>,
  ): MovieInteractionStats | null {
    if (Object.keys(hash).length === 0) return null;

    const candidate = {
      likeCount: Number(hash.likeCount ?? 0),
      commentCount: Number(hash.commentCount ?? 0),
      viewCount: Number(hash.viewCount ?? 0),
      ratingCount: Number(hash.ratingCount ?? 0),
      voteAverage: Number(hash.voteAverage ?? 0),
      ratingTotal: Number(hash.ratingTotal ?? 0),
      ratingAvg: Number(hash.ratingAvg ?? hash.voteAverage ?? 0),
    };
    const parsed = InteractionStatsCacheSchema.safeParse(candidate);
    if (!parsed.success) {
      this.logger.warn(`Stats hash không hợp lệ: ${JSON.stringify(candidate)}`);
      return null;
    }
    return parsed.data;
  }
}
