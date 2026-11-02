import { Module } from '@nestjs/common';
import {
  IRecommendationsService,
  RecommendationsService,
} from './recommendations.service';
import { RecommendationsController } from './recommendations.controller';
import { MoviesModule } from '@/modules/movies/movies.module';

@Module({
  imports: [MoviesModule],
  controllers: [RecommendationsController],
  providers: [
    {
      provide: IRecommendationsService,
      useClass: RecommendationsService,
    },
  ],
  exports: [IRecommendationsService],
})
export class RecommendationsModule {}
