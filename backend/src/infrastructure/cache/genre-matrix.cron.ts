import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GenreStatsCacheService } from './genre-stats-cache.service';
import {
  GENRE_MATRIX_CRON,
  GENRE_MATRIX_LOCK_KEY,
  GENRE_MATRIX_LOCK_TTL_SECONDS,
} from './genre-stats.constants';
import {
  type IRedisLockService,
  REDIS_LOCK_SERVICE,
} from '@/infrastructure/redis/redis-lock.service';

/** Refresh ma trận thể loại lúc 01:00 mỗi ngày. */
@Injectable()
export class GenreMatrixRefreshCron {
  private readonly logger = new Logger(GenreMatrixRefreshCron.name);

  constructor(
    @Inject(REDIS_LOCK_SERVICE) private readonly lock: IRedisLockService,
    private readonly genreStatsCache: GenreStatsCacheService,
  ) {}

  @Cron(GENRE_MATRIX_CRON)
  async handleRefresh(): Promise<void> {
    try {
      await this.lock.runWithLock(
        GENRE_MATRIX_LOCK_KEY,
        GENRE_MATRIX_LOCK_TTL_SECONDS,
        () => this.genreStatsCache.buildGenreMatrices(),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Bỏ qua lần refresh ma trận thể loại: ${message}`);
    }
  }
}
