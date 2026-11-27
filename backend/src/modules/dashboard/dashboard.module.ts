import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '@/modules/comments/entities/comment.entity';
import { Genre } from '@/modules/genres/entities/genre.entity';
import { Interaction } from '@/modules/interactions/entities/interaction.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { Rating } from '@/modules/ratings/entities/rating.entity';
import { User } from '@/modules/users/entities/user.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import {
  DashboardRepository,
  IDASHBOARD_REPOSITORY,
} from './dashboard.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Movie,
      User,
      Genre,
      Interaction,
      Rating,
      Comment,
    ]),
  ],
  controllers: [DashboardController],
  providers: [
    {
      provide: IDASHBOARD_REPOSITORY,
      useClass: DashboardRepository,
    },
    DashboardService,
  ],
  exports: [DashboardService],
})
export class DashboardModule {}
