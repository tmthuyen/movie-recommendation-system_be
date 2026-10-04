import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RatingsService } from './ratings.service';
import { RatingsController } from './ratings.controller';
import { Rating } from './entities/rating.entity';
import { SeedRating } from './entities/seed-rating.entity';
import { RatingRepository, IRatingRepository } from './ratings.repository';
import {
  SeedRatingRepository,
  ISeedRatingRepository,
} from './seed-ratings.repository';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([Rating, SeedRating]), EventsModule],
  controllers: [RatingsController],
  providers: [
    {
      provide: IRatingRepository,
      useClass: RatingRepository,
    },
    {
      provide: ISeedRatingRepository,
      useClass: SeedRatingRepository,
    },
    RatingsService,
  ],
  exports: [RatingsService, ISeedRatingRepository],
})
export class RatingsModule {}
