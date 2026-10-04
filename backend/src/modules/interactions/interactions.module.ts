import { Module } from '@nestjs/common';
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

@Module({
  imports: [TypeOrmModule.forFeature([Interaction]), RatingsModule],
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
