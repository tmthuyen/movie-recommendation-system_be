import { Module } from '@nestjs/common';
import { MovieInteractionStatsService } from './movie-interaction-stats.service';
import { MovieStatsSyncCron } from './movie-stats-sync.cron';
import {
  MOVIE_STATS_REPOSITORY,
  MovieStatsRepository,
} from './movie-stats.repository';

/** Module cung cấp stats phim từ Redis. */
@Module({
  providers: [
    MovieInteractionStatsService,
    MovieStatsSyncCron,
    {
      provide: MOVIE_STATS_REPOSITORY,
      useClass: MovieStatsRepository,
    },
  ],
  exports: [
    MovieInteractionStatsService,
    MovieStatsSyncCron,
    MOVIE_STATS_REPOSITORY,
  ],
})
export class InteractionStatsModule {}
