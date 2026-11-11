import { MovieResponseDto } from '@/modules/movies/dto/movie-response.dto';
import { Expose } from 'class-transformer';

export class SimilarMovieResponseDto extends MovieResponseDto {
  @Expose()
  similarityScore: number;

  @Expose()
  rank?: number;
}

export class HybridMovieResponseDto extends MovieResponseDto {
  @Expose()
  hybridScore: number;

  @Expose()
  rank?: number;
}
