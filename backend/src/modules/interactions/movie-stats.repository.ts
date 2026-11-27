import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { MovieInteractionStats } from './movie-interaction-stats.service';

export const MOVIE_STATS_REPOSITORY = 'MOVIE_STATS_REPOSITORY';

export interface IMovieStatsRepository {
  syncFromCache(movieId: number, stats: MovieInteractionStats): Promise<void>;
  findAllForBootstrap(): Promise<
    Array<MovieInteractionStats & { movieId: number }>
  >;
  findOneForBootstrap(
    movieId: number,
  ): Promise<(MovieInteractionStats & { movieId: number }) | null>;
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
    const rows = await this.queryBootstrapRows();
    return rows.map(row => this.mapBootstrapRow(row));
  }

  async findOneForBootstrap(
    movieId: number,
  ): Promise<(MovieInteractionStats & { movieId: number }) | null> {
    const rows = await this.queryBootstrapRows('WHERE m.id = $1 LIMIT 1', [
      movieId,
    ]);
    return rows[0] ? this.mapBootstrapRow(rows[0]) : null;
  }

  private queryBootstrapRows(
    whereClause = '',
    params: unknown[] = [],
  ): Promise<BootstrapRow[]> {
    return this.dataSource.query<BootstrapRow[]>(
      `SELECT
         m.id,
         COALESCE((SELECT COUNT(*)::int FROM interactions i WHERE i.movie_id = m.id AND i.type = 'like'), 0) AS "likeCount",
         COALESCE((SELECT COUNT(*)::int FROM comments c WHERE c.movie_id = m.id), 0) AS "commentCount",
         COALESCE(m.view_count, 0)::int AS "viewCount",
         COALESCE((SELECT COUNT(*)::int FROM ratings r WHERE r.movie_id = m.id), 0) AS "ratingCount",
         COALESCE((SELECT SUM(r.rating)::float FROM ratings r WHERE r.movie_id = m.id), 0) AS "ratingTotal",
         COALESCE((SELECT AVG(r.rating)::float FROM ratings r WHERE r.movie_id = m.id), 0) AS "ratingAvg",
         COALESCE(m.vote_count, 0)::int AS "movieVoteCount",
         COALESCE(m.vote_average, 0)::float AS "movieVoteAverage"
       FROM movies m
       ${whereClause}`,
      params,
    );
  }

  private mapBootstrapRow(
    row: BootstrapRow,
  ): MovieInteractionStats & { movieId: number } {
    const localRatingCount = Number(row.ratingCount) || 0;
    const useLocalRatings = localRatingCount > 0;
    const fallbackRatingCount = Number(row.movieVoteCount) || 0;
    const fallbackRatingAvg = Number(row.movieVoteAverage) || 0;

    const ratingCount = useLocalRatings
      ? localRatingCount
      : fallbackRatingCount;
    const ratingAvg = Math.min(
      10,
      Math.max(
        0,
        useLocalRatings ? Number(row.ratingAvg) || 0 : fallbackRatingAvg,
      ),
    );
    const ratingTotal = useLocalRatings
      ? Number(row.ratingTotal) || 0
      : Number((ratingAvg * ratingCount).toFixed(2));

    return {
      movieId: Number(row.id),
      likeCount: Number(row.likeCount) || 0,
      commentCount: Number(row.commentCount) || 0,
      viewCount: Number(row.viewCount) || 0,
      ratingCount,
      voteAverage: ratingAvg,
      ratingTotal,
      ratingAvg,
    };
  }
}

interface BootstrapRow {
  id: number;
  likeCount: number | string;
  commentCount: number | string;
  viewCount: number | string;
  ratingCount: number | string;
  ratingTotal: number | string;
  ratingAvg: number | string;
  movieVoteCount: number | string;
  movieVoteAverage: number | string;
}
