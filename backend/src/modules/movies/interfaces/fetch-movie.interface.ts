import { Movie } from '@/modules/movies/entities/movie.entity';
import { TmdbDiscoverRequestDto } from '@/modules/movies/dto/tmdb-discover-request.dto';
import { TmdbMovieCandidate } from '@/modules/movies/tmdb/tmdb-movie.types';

export const IFetchMovieService = Symbol('IFetchMovieService');

export interface IFetchMovieService {
  discover(request: TmdbDiscoverRequestDto): Promise<TmdbMovieCandidate[]>;
  importOne(tmdbId: number): Promise<Movie | null>;
  importMany(tmdbIds: number[]): Promise<Movie[]>;
  discoverAndImport(request: TmdbDiscoverRequestDto): Promise<Movie[]>;
}
