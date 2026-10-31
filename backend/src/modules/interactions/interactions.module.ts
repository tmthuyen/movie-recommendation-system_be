import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InteractionsService } from './interactions.service';
import { InteractionsController } from './interactions.controller';
import { InteractionCronService } from './interaction.cron';
import { Interaction } from './entities/interaction.entity';
import {
  InteractionRepository,
  IInteractionRepository,
} from './interactions.repository';
import { RatingsModule } from '../ratings/ratings.module';
import { EventsModule } from '../events/events.module';
import { InteractionStatsModule } from './interaction-stats.module';
import { MoviesModule } from '@/modules/movies/movies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Interaction]),
    forwardRef(() => RatingsModule),
    forwardRef(() => EventsModule),
    InteractionStatsModule,
    MoviesModule,
  ],
  controllers: [InteractionsController],
  providers: [
    {
      provide: IInteractionRepository,
      useClass: InteractionRepository,
    },
    InteractionsService,
    InteractionCronService,
  ],
  exports: [InteractionsService, IInteractionRepository],
})
export class InteractionsModule {}
