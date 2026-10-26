import { Module } from '@nestjs/common';
import { MovieInteractionStatsService } from './movie-interaction-stats.service';

/**
 * Module chia sẻ số liệu tương tác phim cho Interactions / Comments / Movies.
 * Chỉ phụ thuộc `DataSource` nên không tạo vòng import giữa các module.
 */
@Module({
  providers: [MovieInteractionStatsService],
  exports: [MovieInteractionStatsService],
})
export class InteractionStatsModule {}
