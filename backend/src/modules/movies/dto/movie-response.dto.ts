import { BaseResponseDto } from '@/common/dtos/base-response.dto';
import { CountryResponseDto } from '@/modules/countries/dto/country-response.dto';
import { GenreResponseDto } from '@/modules/genres/dto/genre-response.dto';
import { MoviePeopleResponseDto } from '@/modules/movies/dto/movie-people-response.dto';
import { Expose, Type } from 'class-transformer';

export class MovieResponseDto extends BaseResponseDto {
  @Expose()
  @Type(() => Number)
  id: number;

  @Expose()
  @Type(() => Number)
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
  @Type(() => Number)
  budget: number;

  @Expose()
  @Type(() => Number)
  revenue: number;

  @Expose()
  status: string;

  @Expose()
  video: boolean;

  @Expose()
  isAiTranslated: boolean;

  @Expose()
  @Type(() => Number)
  tmdbRating: number;

  @Expose()
  @Type(() => Number)
  voteAverage: number;

  @Expose()
  @Type(() => Number)
  voteCount: number;

  @Expose()
  @Type(() => Number)
  viewCount: number;

  @Expose()
  @Type(() => Number)
  likeCount: number;

  // relations
  @Expose()
  @Type(() => GenreResponseDto)
  genres: GenreResponseDto[];

  @Expose()
  @Type(() => CountryResponseDto)
  countries: CountryResponseDto[];

  @Expose()
  @Type(() => MoviePeopleResponseDto)
  moviePeoples: MoviePeopleResponseDto[];
}
