import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoviesService } from './movies.service';
import { MoviesController } from './movies.controller';
import { Movie } from './entities/movie.entity';
import { MoviePeople } from './entities/movie-people.entity';
import { MovieRepository, IMovieRepository } from './movies.repository';
import { MessagingModule } from '@/infrastructure/messaging/messaging.module';

@Module({
  imports: [TypeOrmModule.forFeature([Movie, MoviePeople]), MessagingModule],
  controllers: [MoviesController],
  providers: [
    {
      provide: IMovieRepository,
      useClass: MovieRepository,
    },
    MoviesService,
  ],
  exports: [MoviesService],
})
export class MoviesModule {}
