import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { MovieInteractionStats } from './movie-interaction-stats.service';

export const MOVIE_STATS_REPOSITORY = 'MOVIE_STATS_REPOSITORY';

export interface IMovieStatsRepository {
  syncFromCache(movieId: number, stats: MovieInteractionStats): Promise<void>;
  findAllForBootstrap(): Promise<
    Array<MovieInteractionStats & { movieId: number }>
  >;
}

@Injectable()
export class MovieStatsRepository implements IMovieStatsRepository {
  constructor(private readonly dataSource: DataSource) {}

  async syncFromCache(
    movieId: number,
    stats: MovieInteractionStats,
  ): Promise<void> {
    await this.dataSource.query(
      `UPDATE movies
       SET view_count = $1, like_count = $2, vote_count = $3,
           vote_average = $4, updated_at = NOW()
       WHERE id = $5`,
      [
        stats.viewCount,
        stats.likeCount,
        stats.ratingCount,
        stats.ratingAvg,
        movieId,
      ],
    );
  }

  async findAllForBootstrap(): Promise<
    Array<MovieInteractionStats & { movieId: number }>
  > {
    const rows = await this.dataSource.query<
      Array<{
        id: number;
        likeCount: number | string;
        commentCount: number | string;
        viewCount: number | string;
        ratingCount: number | string;
        voteAverage: number | string;
      }>
    >(
      `SELECT
         m.id,
         COALESCE(m.like_count, 0)::int AS "likeCount",
         COALESCE((SELECT COUNT(*)::int FROM comments c WHERE c.movie_id = m.id), 0) AS "commentCount",
         COALESCE(m.view_count, 0)::int AS "viewCount",
         COALESCE(m.vote_count, 0)::int AS "ratingCount",
         COALESCE(m.vote_average, 0)::float AS "voteAverage"
       FROM movies m`,
    );

    return rows.map(row => {
      const ratingCount = Number(row.ratingCount) || 0;
      const ratingAvg = Number(row.voteAverage) || 0;
      return {
        movieId: Number(row.id),
        likeCount: Number(row.likeCount) || 0,
        commentCount: Number(row.commentCount) || 0,
        viewCount: Number(row.viewCount) || 0,
        ratingCount,
        voteAverage: ratingAvg,
        ratingTotal: Number((ratingAvg * ratingCount).toFixed(2)),
        ratingAvg,
      };
    });
  }
}
