import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { GenreResponseDto } from '@/modules/genres/dto/genre-response.dto';
import { MoviePeopleResponseDto } from '@/modules/movies/dto/movie-people-response.dto';
import { Expose, Type } from 'class-transformer';

export class MovieResponseDto extends BaseResponseDto {
  @Expose()
  id: number;

  @Expose()
  tmdbId: number;

  @Expose()
  imdbId: string;

  @Expose()
  title: string;

  @Expose()
  titleVi: string;

  @Expose()
  overview: string;

  @Expose()
  overviewVi: string;

  @Expose()
  releaseDate: string;

  @Expose()
  posterPath: string;

  @Expose()
  backdropPath: string;

  @Expose()
  homepage: string;

  @Expose()
  originCountry: string;

  @Expose()
  originalLanguage: string;

  @Expose()
  budget: number;

  @Expose()
  revenue: number;

  @Expose()
  status: string;

  @Expose()
  video: boolean;

  @Expose()
  isAiTranslated: boolean;

  @Expose()
  tmdbRating: number;

  @Expose()
  voteAverage: number;

  @Expose()
  voteCount: number;

  @Expose()
  viewCount: number;

  @Expose()
  likeCount: number;

  // relations
  @Expose()
  @Type(() => GenreResponseDto)
  genres: GenreResponseDto[];

  @Expose()
  @Type(() => MoviePeopleResponseDto)
  moviePeoples: MoviePeopleResponseDto[];
}
