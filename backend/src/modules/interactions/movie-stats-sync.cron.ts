import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { IRedisLockService } from '@/infrastructure/redis/redis-lock.service';
import { REDIS_LOCK_SERVICE } from '@/infrastructure/redis/redis-lock.service';
import { MovieInteractionStatsService } from './movie-interaction-stats.service';
import { MOVIE_STATS_REPOSITORY } from './movie-stats.repository';
import type { IMovieStatsRepository } from './movie-stats.repository';

/** Đồng bộ snapshot stats từ Redis xuống DB. */
@Injectable()
export class MovieStatsSyncCron {
  private readonly logger = new Logger(MovieStatsSyncCron.name);

  constructor(
    @Inject(REDIS_LOCK_SERVICE) private readonly lock: IRedisLockService,
    @Inject(MOVIE_STATS_REPOSITORY)
    private readonly repo: IMovieStatsRepository,
    private readonly stats: MovieInteractionStatsService,
  ) {}

  /**
   * Cron job này sẽ chạy để đồng bộ stats từ Redis xuống DB.
   * Thời gian chạy là 3 giờ sáng mỗi ngày (0 0 3 * * *).
   */
  @Cron('0 */2 * * * *')
  async syncToDatabase(): Promise<void> {
    this.logger.log('Bắt đầu đồng bộ stats Redis → DB...');
    await this.lock.runWithLockOrFallback(
      'lock:stats:sync',
      120,
      { waitMs: 0 },
      async () => {
        const movieIds = await this.stats.listDirtyMovieIds();
        let synced = 0;

        for (const movieId of movieIds) {
          const snapshot = await this.stats.getStats(movieId);
          await this.repo.syncFromCache(movieId, snapshot);
          await this.stats.clearDirty(movieId);
          synced += 1;
        }

        this.logger.log(`Đã đồng bộ stats Redis → DB cho ${synced} phim.`);
      },
      () => Promise.resolve(undefined),
    );
  }

  /** Nạp stats từ DB vào Redis. */
  async bootstrapFromDatabase(): Promise<void> {
    const rows = await this.repo.findAllForBootstrap();
    await this.stats.seedFromDb(
      rows.map(row => ({
        movieId: row.movieId,
        likeCount: row.likeCount,
        commentCount: row.commentCount,
        viewCount: row.viewCount,
        ratingCount: row.ratingCount,
        voteAverage: row.voteAverage,
        ratingTotal: row.ratingTotal,
        ratingAvg: row.ratingAvg,
      })),
    );
    this.logger.log(`Đã bootstrap stats cho ${rows.length} phim.`);
  }
}
