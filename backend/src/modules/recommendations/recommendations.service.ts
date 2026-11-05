import { AppException } from '@/common/custom-exception/app-exception';
import { Pagination } from '@/common/dtos/api-response.dto';
import { ResultWithPagination } from '@/common/dtos/paginated-result.interface';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { IMovieRepository } from '@/modules/movies/movies.repository';
import { MoviesService } from '@/modules/movies/movies.service';
import { HybridSearchQuery } from '@/modules/recommendations/dtos/hybrid-search-query.dto';
import { SimilarMovieResponseDto } from '@/modules/recommendations/dtos/movie-response-with-score.dto';
import {
  SimilarFromAiServiceResponse,
  SimilarFromAiServiceResponseSchema,
} from '@/modules/recommendations/interfaces/ai-service-response.interfaces';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || 'http://localhost:8082/api/recommendations';

export const IRecommendationsService = Symbol('IRecommendationsService');
export interface IRecommendationsService {
  getSimilarMovies(
    movieId: number,
    topK?: number,
  ): Promise<ResultWithPagination<SimilarMovieResponseDto>>;
  semanticSearch(keyword: string, topK?: number): Promise<any>;
  hybridSearch(hybridSearchQuery: HybridSearchQuery): Promise<any>;
}
@Injectable()
export class RecommendationsService implements IRecommendationsService {
  private readonly logger = new Logger(RecommendationsService.name);
  constructor(private readonly movieService: MoviesService) {}

  async getSimilarMovies(
    movieId: number,
    topK?: number,
  ): Promise<ResultWithPagination<SimilarMovieResponseDto>> {
    // check movie exists
    const movie = await this.movieService.findOne(movieId);
    if (!movie) {
      throw new AppException(
        HttpStatus.NOT_FOUND,
        `Không tìm thấy phim với id ${movieId}`,
        `Không tìm thấy phim với id ${movieId}`,
        'MOVIE_NOT_FOUND',
      );
    }

    // request to AI service
    try {
      const res = await fetch(
        `${AI_SERVICE_URL}/similar/${movieId}?topK=${topK || 10}`,
      );

      // AI service trả lỗi HTTP hoặc body không đúng schema → map về AppException
      // (nếu không, ZodError sẽ nổi lên thành 500 thay vì 400).
      let parsedResponse: SimilarFromAiServiceResponse;
      try {
        parsedResponse = SimilarFromAiServiceResponseSchema.parse(
          await res.json(),
        );
      } catch (error) {
        this.logger.error(
          `Invalid response from AI service (status=${res.status}): ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Invalid response from AI service',
          'The AI service did not return a valid response for similar movies.',
          'AI_SERVICE_ERROR',
        );
      }

      this.logger.log(`AI service response: ${JSON.stringify(parsedResponse)}`);

      if (!parsedResponse || !parsedResponse.result) {
        this.logger.error(
          `Invalid response from AI service: ${JSON.stringify(parsedResponse)}`,
        );
        throw new AppException(
          HttpStatus.BAD_REQUEST,
          'Invalid response from AI service',
          'The AI service did not return a valid response for similar movies.',
          'AI_SERVICE_ERROR',
        );
      }

      // find all by ids
      const movieIds = parsedResponse.result.map(item => item.id);
      const movieEntities = await this.movieService.findByIds(movieIds);

      // Map để lưu movie theo id và kết quả từ AI service
      const movieMap = new Map<number, Movie>();
      for (const movieEntity of movieEntities) {
        movieMap.set(movieEntity.id, movieEntity);
      }

      // map with db
      const mappedData: (Partial<Movie> & {
        similarityScore: number;
        rank?: number;
      })[] = [];

      for (const item of parsedResponse.result) {
        const movie = movieMap.get(item.id);
        if (!movie) {
          this.logger.warn(
            `Movie with id ${item.id} not found in database, skipping.`,
          );
          continue;
        }

        const rank =
          item.rank ||
          (parsedResponse.pagination.page - 1) *
            parsedResponse.pagination.limit +
            parsedResponse.result.indexOf(item) +
            1;

        mappedData.push({
          ...movie,
          similarityScore: item.similarityScore,
          rank,
        });
      }

      const result = plainToInstance(SimilarMovieResponseDto, mappedData, {
        excludeExtraneousValues: true,
      });
      // return result

      // Envelope backend dùng cùng tên field với ai-service → map 1:1.
      const resultWithPagi: ResultWithPagination<SimilarMovieResponseDto> = {
        result,
        pagination: {
          page: parsedResponse.pagination.page,
          limit: parsedResponse.pagination.limit,
          total: parsedResponse.pagination.total,
          totalPages: parsedResponse.pagination.totalPages,
        },
      };

      return resultWithPagi;
    } catch (error) {
      // Lỗi nghiệp vụ (movie không tồn tại, AI trả sai schema) phải nổi lên
      // để client biết — không nuốt thành success rỗng.
      if (error instanceof AppException) {
        throw error;
      }

      // Lỗi mạng/không xác định: log và trả empty result.
      this.logger.error(
        `Error while calling AI service for similar movies: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );

      return {
        result: [],
        pagination: {
          page: 1,
          limit: topK || 10,
          total: 0,
          totalPages: 0,
        },
      };
    }
  }

  async semanticSearch(keyword: string, topK?: number): Promise<any> {}

  async hybridSearch(hybridSearchQuery: HybridSearchQuery): Promise<any> {}
}
