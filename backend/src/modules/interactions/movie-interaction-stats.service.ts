import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';

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
 */
@Injectable()
export class MovieInteractionStatsService {
  constructor(private readonly dataSource: DataSource) {}

  async getStats(movieId: number): Promise<MovieInteractionStats> {
    const rows = await this.dataSource.query<MovieInteractionStatsRow[]>(
      `SELECT
         COALESCE((
           SELECT COUNT(*)::int
           FROM interactions i
           WHERE i.movie_id = $1 AND i.type = 'like'
         ), 0) AS "likeCount",
         COALESCE((
           SELECT COUNT(*)::int
           FROM comments c
           WHERE c.movie_id = $1
         ), 0) AS "commentCount",
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
