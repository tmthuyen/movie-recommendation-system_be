import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoviesService } from './movies.service';
import { MoviesController } from './movies.controller';
import { Movie } from './entities/movie.entity';
import { MoviePeople } from './entities/movie-people.entity';
import { MovieRepository, IMovieRepository } from './movies.repository';
import { EventsModule } from '../events/events.module';
import { MovieProducer } from '@/infrastructure/messaging/producers/movie.producer';

@Module({
  imports: [TypeOrmModule.forFeature([Movie, MoviePeople]), EventsModule],
  controllers: [MoviesController],
  providers: [
    {
      provide: IMovieRepository,
      useClass: MovieRepository,
    },
    MoviesService,
    MovieProducer,
  ],
  exports: [MoviesService],
})
export class MoviesModule {}
