import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FailedEvent } from './entities/failed-event.entity';
import {
  FailedEventRepository,
  IFailedEventRepository,
} from './failed-events.repository';
import { FailedEventsService } from './failed-events.service';
import { FailedEventsController } from './failed-events.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FailedEvent])],
  controllers: [FailedEventsController],
  providers: [
    {
      provide: IFailedEventRepository,
      useClass: FailedEventRepository,
    },
    FailedEventsService,
  ],
  exports: [FailedEventsService],
})
export class FailedEventsModule {}
