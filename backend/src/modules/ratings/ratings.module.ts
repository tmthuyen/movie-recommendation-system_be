import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RatingsService } from './ratings.service';
import { RatingsController } from './ratings.controller';
import { Rating } from './entities/rating.entity';
import { RatingRepository, IRatingRepository } from './ratings.repository';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([Rating]), EventsModule],
  controllers: [RatingsController],
  providers: [
    {
      provide: IRatingRepository,
      useClass: RatingRepository,
    },
    RatingsService,
  ],
  exports: [RatingsService],
})
export class RatingsModule {}
