import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MoviesService } from './movies.service';
import { MoviesController } from './movies.controller';
import { Movie } from './entities/movie.entity';
import { MoviePeople } from './entities/movie-people.entity';
import { MovieRepository, IMovieRepository } from './movies.repository';
import { EventsModule } from '../events/events.module';
import { MovieProducer } from '@/infrastructure/messaging/producers/movie.producer';
import { InteractionStatsModule } from '../interactions/interaction-stats.module';
import { HttpModule } from '@nestjs/axios';
import { GenresModule } from '@/modules/genres/genres.module';
import { CountriesModule } from '@/modules/countries/countries.module';
import { FetchMovieService } from './fetch-movie.service';
import { TmdbMovieClient } from './tmdb/tmdb-movie-client';
import { IFetchMovieService } from './interfaces/fetch-movie.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([Movie, MoviePeople]),
    EventsModule,
    InteractionStatsModule,
    GenresModule,
    CountriesModule,
    HttpModule.register({}),
  ],
  controllers: [MoviesController],
  providers: [
    {
      provide: IMovieRepository,
      useClass: MovieRepository,
    },
    MoviesService,
    TmdbMovieClient,
    {
      provide: IFetchMovieService,
      useClass: FetchMovieService,
    },
    MovieProducer,
  ],
  exports: [MoviesService, IMovieRepository],
})
export class MoviesModule {}
