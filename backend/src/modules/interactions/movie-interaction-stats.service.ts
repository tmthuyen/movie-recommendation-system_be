import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { ICacheService } from '@/infrastructure/cache/redis-cache.service';
import { CacheKeys, CacheTtl } from '@/infrastructure/cache/cache.keys';
import { InteractionStatsCacheSchema } from '@/infrastructure/cache/cache.schemas';

/** Thống kê tương tác hiển thị ở trang chi tiết phim. */
export interface MovieInteractionStats {
  likeCount: number;
  commentCount: number;
  viewCount: number;
  ratingCount: number;
  voteAverage: number;
}

interface MovieInteractionStatsRow {
  likeCount: number | string;
  commentCount: number | string;
  viewCount: number | string;
  ratingCount: number | string;
  voteAverage: number | string;
}

/**
 * Truy vấn tổng hợp số liệu tương tác của một phim trong **một** câu SQL
 * (tránh N+1 và tránh phụ thuộc chéo giữa các module).
 *
 * Cache TTL ngắn (60s) cho luồng đọc thường; khi được gọi trong transaction
 * (`manager` được truyền) thì **bỏ qua cache** vì dữ liệu phải thấy thay đổi
 * chưa commit.
 */
@Injectable()
export class MovieInteractionStatsService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(ICacheService) private readonly cache: ICacheService,
  ) {}

  async getStats(
    movieId: number,
    manager?: EntityManager,
  ): Promise<MovieInteractionStats> {
    if (manager) {
      return this.queryStats(movieId, manager);
    }

    return this.cache.getOrLoad<MovieInteractionStats>({
      key: CacheKeys.interaction.stats(movieId),
      schema: InteractionStatsCacheSchema,
      ttlSeconds: CacheTtl.interactionStats,
      loader: () => this.queryStats(movieId, this.dataSource),
    });
  }

  private async queryStats(
    movieId: number,
    ds: DataSource | EntityManager,
  ): Promise<MovieInteractionStats> {
    const rows = await ds.query<MovieInteractionStatsRow[]>(
      `SELECT
         COALESCE((
           SELECT COUNT(*)::int
           FROM comments c
           WHERE c.movie_id = $1
         ), 0) AS "commentCount",
         COALESCE((m.like_count)::int, 0) AS "likeCount",
         COALESCE(m.view_count, 0)::int AS "viewCount",
         COALESCE(m.vote_count, 0)::int AS "ratingCount",
         COALESCE(m.vote_average, 0)::float AS "voteAverage"
       FROM movies m
       WHERE m.id = $1`,
      [movieId],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException(`Không tìm thấy phim với ID ${movieId}`);
    }

    return {
      likeCount: Number(row.likeCount) || 0,
      commentCount: Number(row.commentCount) || 0,
      viewCount: Number(row.viewCount) || 0,
      ratingCount: Number(row.ratingCount) || 0,
      voteAverage: Number(row.voteAverage) || 0,
    };
  }
}
