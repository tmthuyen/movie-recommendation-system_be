import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InteractionsService } from './interactions.service';
import { InteractionsController } from './interactions.controller';
import { Interaction } from './entities/interaction.entity';
import {
  InteractionRepository,
  IInteractionRepository,
} from './interactions.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Interaction])],
  controllers: [InteractionsController],
  providers: [
    {
      provide: IInteractionRepository,
      useClass: InteractionRepository,
    },
    InteractionsService,
  ],
  exports: [InteractionsService, IInteractionRepository],
})
export class InteractionsModule {}
