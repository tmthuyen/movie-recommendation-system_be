import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { z } from 'zod';
import { AppException } from '@/common/custom-exception/app-exception';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { MoviesService } from '@/modules/movies/movies.service';
import { SimilarMovieResponseDto } from '@/modules/recommendations/dtos/movie-response-with-score.dto';
import { ChatRagResponseDto, ChatRequestDto } from './dtos/chat.dto';

const AI_SERVICE_URL =
  process.env.AI_SERVICE_URL || 'http://localhost:8082/api/recommendations';

const DEFAULT_CHAT_TOP_K = 5;

const ChatMovieItemFromAiSchema = z.object({
  id: z.number(),
  similarityScore: z.number().optional(),
  score: z.number().optional(),
  rank: z.number().optional(),
});

const ChatFromAiServiceResponseSchema = z.object({
  success: z.boolean(),
  statusCode: z.number(),
  message: z.string(),
  result: z.object({
    answer: z.string(),
    movies: z.array(ChatMovieItemFromAiSchema).default([]),
  }),
});

export const IChatService = Symbol('IChatService');

export interface IChatService {
  ask(dto: ChatRequestDto): Promise<ChatRagResponseDto>;
}

@Injectable()
export class ChatService implements IChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(private readonly movieService: MoviesService) {}

  async ask(dto: ChatRequestDto): Promise<ChatRagResponseDto> {
    const cleanMessage = dto.message.trim();
    const topK = dto.topK ?? DEFAULT_CHAT_TOP_K;
    const startedAt = Date.now();

    let res: Response;
    try {
      res = await fetch(`${AI_SERVICE_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cleanMessage,
          topK,
        }),
      });
    } catch (error) {
      this.logger.error(
        `Gọi ai-service /chat thất bại: ${Date.now() - startedAt}ms`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'Không thể kết nối trợ lý AI, vui lòng thử lại sau.',
        'ai-service /chat connection failed',
        'AI_SERVICE_UNAVAILABLE',
      );
    }

    if (!res.ok) {
      this.logger.error(
        `Gọi ai-service /chat trả mã lỗi: status=${res.status}, ${Date.now() - startedAt}ms`,
      );
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'Trợ lý AI đang bận, vui lòng thử lại sau.',
        `ai-service /chat returned status ${res.status}`,
        'AI_SERVICE_ERROR',
      );
    }

    let parsed: z.infer<typeof ChatFromAiServiceResponseSchema>;
    try {
      const raw = await res.json();
      parsed = ChatFromAiServiceResponseSchema.parse(raw);
    } catch (error) {
      this.logger.error(
        `Dữ liệu trả về từ ai-service /chat không hợp lệ: ${Date.now() - startedAt}ms`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new AppException(
        HttpStatus.BAD_GATEWAY,
        'Dữ liệu trả về từ trợ lý AI không hợp lệ.',
        'Invalid response schema from ai-service /chat',
        'AI_SERVICE_INVALID_RESPONSE',
      );
    }

    const aiMovies = parsed.result.movies;
    const hydratedMovies = await this.hydrateMovies(aiMovies);

    this.logger.log(
      `Gọi ai-service /chat thành công: items=${hydratedMovies.length}, ${Date.now() - startedAt}ms`,
    );

    return {
      answer: parsed.result.answer,
      movies: hydratedMovies,
    };
  }

  private async hydrateMovies(
    items: Array<{
      id: number;
      score?: number;
      similarityScore?: number;
      rank?: number;
    }>,
  ): Promise<SimilarMovieResponseDto[]> {
    if (items.length === 0) return [];

    const seen = new Set<number>();
    const uniqueItems = items.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    const itemIds = uniqueItems.map(item => item.id);
    const movies = await this.movieService.findByIds(itemIds);

    const movieById = new Map<number, Movie>();
    for (const movie of movies) {
      movieById.set(Number(movie.id), movie);
    }

    const mappedData = uniqueItems
      .map((item, idx) => {
        const movie = movieById.get(Number(item.id));
        if (!movie) return null;
        return {
          ...movie,
          score: item.score ?? item.similarityScore ?? 0,
          rank: item.rank ?? idx + 1,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return plainToInstance(SimilarMovieResponseDto, mappedData, {
      excludeExtraneousValues: true,
    });
  }
}
