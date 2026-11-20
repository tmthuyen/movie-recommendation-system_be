import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { plainToInstance } from 'class-transformer';
import { z } from 'zod';
import { AppException } from '@/common/custom-exception/app-exception';
import { Comment } from '@/modules/comments/entities/comment.entity';
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
    intent: z.string().optional(),
    statType: z.string().optional(),
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

  constructor(
    private readonly movieService: MoviesService,
    private readonly dataSource: DataSource,
  ) {}

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

    const { intent, statType, answer } = parsed.result;

    // Nhánh 1: Thống kê hệ thống -> Backend truy vấn cơ sở dữ liệu quan hệ
    if (intent === 'SYSTEM_STATS') {
      return this.handleSystemStats(statType);
    }

    // Nhánh 2 & 3: Chào hỏi (CHITCHAT) hoặc Ngoài lề (OUT_OF_SCOPE) -> Không cần phim đính kèm
    if (intent === 'CHITCHAT' || intent === 'OUT_OF_SCOPE') {
      return {
        answer,
        movies: [],
        intent,
      };
    }

    // Nhánh 4: Tìm & Gợi ý phim (MOVIE_SEARCH_RAG) -> Hydrate thông tin phim từ DB
    const aiMovies = parsed.result.movies;
    const hydratedMovies = await this.hydrateMovies(aiMovies);

    this.logger.log(
      `Gọi ai-service /chat thành công (intent=${intent}): items=${hydratedMovies.length}, ${Date.now() - startedAt}ms`,
    );

    return {
      answer,
      movies: hydratedMovies,
      intent: intent ?? 'MOVIE_SEARCH_RAG',
    };
  }

  /** Xử lý truy vấn thống kê dữ liệu thực tế từ hệ thống cơ sở dữ liệu. */
  private async handleSystemStats(
    statType?: string,
  ): Promise<ChatRagResponseDto> {
    try {
      if (statType === 'most_commented') {
        const topComments = await this.dataSource
          .getRepository(Comment)
          .createQueryBuilder('comment')
          .select('comment.movie_id', 'movieId')
          .addSelect('COUNT(*)', 'count')
          .groupBy('comment.movie_id')
          .orderBy('count', 'DESC')
          .limit(5)
          .getRawMany<{ movieId: string | number; count: string | number }>();

        if (topComments.length === 0) {
          return {
            answer:
              'Hiện tại hệ thống chưa ghi nhận bình luận nào từ người dùng cho các bộ phim. Hãy là người đầu tiên trải nghiệm và chia sẻ cảm nghĩ về bộ phim bạn yêu thích nhé!',
            movies: [],
            intent: 'SYSTEM_STATS',
            statType,
          };
        }

        const movieIds = topComments
          .map((item) => Number(item.movieId))
          .filter((id) => !isNaN(id) && id > 0);

        const movies = await this.movieService.findByIds(movieIds);
        const movieMap = new Map<number, Movie>();
        for (const m of movies) {
          movieMap.set(Number(m.id), m);
        }

        const lines = [
          'Dưới đây là các bộ phim có nhiều lượt bình luận và thảo luận sôi nổi nhất trên hệ thống Moviere:',
        ];

        const mappedWithScores = topComments
          .map((item, idx) => {
            const m = movieMap.get(Number(item.movieId));
            if (!m) return null;
            const title = m.titleVi || m.title;
            lines.push(
              `${idx + 1}. **${title}** — 💬 ${item.count} bình luận`,
            );
            return {
              ...m,
              score: Number(item.count),
              rank: idx + 1,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        lines.push(
          '\nBạn có thể nhấn vào từng bộ phim bên dưới để xem chi tiết và tham gia thảo luận nhé!',
        );

        const hydrated = plainToInstance(
          SimilarMovieResponseDto,
          mappedWithScores,
          { excludeExtraneousValues: true },
        );

        return {
          answer: lines.join('\n'),
          movies: hydrated,
          intent: 'SYSTEM_STATS',
          statType,
        };
      }

      if (statType === 'top_rated') {
        const topRated = await this.dataSource
          .getRepository(Movie)
          .createQueryBuilder('movie')
          .where('movie.voteAverage > 0')
          .orderBy('movie.voteAverage', 'DESC')
          .addOrderBy('movie.voteCount', 'DESC')
          .limit(5)
          .getMany();

        if (topRated.length === 0) {
          return {
            answer:
              'Hiện tại chưa có đủ dữ liệu đánh giá cho các bộ phim trong hệ thống.',
            movies: [],
            intent: 'SYSTEM_STATS',
            statType,
          };
        }

        const lines = [
          'Dưới đây là top các bộ phim có điểm đánh giá cao nhất trên hệ thống Moviere:',
        ];

        const mappedWithScores = topRated.map((m, idx) => {
          const title = m.titleVi || m.title;
          const rating = Number(m.voteAverage || 0).toFixed(1);
          lines.push(
            `${idx + 1}. **${title}** — ⭐ ${rating}/10 (${m.voteCount || 0} lượt đánh giá)`,
          );
          return {
            ...m,
            score: Number(m.voteAverage || 0),
            rank: idx + 1,
          };
        });

        lines.push(
          '\nBạn có thể nhấn vào từng phim bên dưới để xem chi tiết và trải nghiệm nhé!',
        );

        const hydrated = plainToInstance(
          SimilarMovieResponseDto,
          mappedWithScores,
          { excludeExtraneousValues: true },
        );

        return {
          answer: lines.join('\n'),
          movies: hydrated,
          intent: 'SYSTEM_STATS',
          statType,
        };
      }

      if (statType === 'most_viewed') {
        const mostViewed = await this.dataSource
          .getRepository(Movie)
          .createQueryBuilder('movie')
          .orderBy('movie.viewCount', 'DESC')
          .limit(5)
          .getMany();

        const lines = [
          'Dưới đây là các bộ phim có nhiều lượt xem nhất trên hệ thống Moviere:',
        ];

        const mappedWithScores = mostViewed.map((m, idx) => {
          const title = m.titleVi || m.title;
          lines.push(
            `${idx + 1}. **${title}** — 👁️ ${m.viewCount || 0} lượt xem`,
          );
          return {
            ...m,
            score: Number(m.viewCount || 0),
            rank: idx + 1,
          };
        });

        const hydrated = plainToInstance(
          SimilarMovieResponseDto,
          mappedWithScores,
          { excludeExtraneousValues: true },
        );

        return {
          answer: lines.join('\n'),
          movies: hydrated,
          intent: 'SYSTEM_STATS',
          statType,
        };
      }

      if (statType === 'most_liked') {
        const mostLiked = await this.dataSource
          .getRepository(Movie)
          .createQueryBuilder('movie')
          .orderBy('movie.likeCount', 'DESC')
          .limit(5)
          .getMany();

        const lines = [
          'Dưới đây là các bộ phim được yêu thích (nhiều lượt thích) nhất trên hệ thống:',
        ];

        const mappedWithScores = mostLiked.map((m, idx) => {
          const title = m.titleVi || m.title;
          lines.push(
            `${idx + 1}. **${title}** — ❤️ ${m.likeCount || 0} lượt thích`,
          );
          return {
            ...m,
            score: Number(m.likeCount || 0),
            rank: idx + 1,
          };
        });

        const hydrated = plainToInstance(
          SimilarMovieResponseDto,
          mappedWithScores,
          { excludeExtraneousValues: true },
        );

        return {
          answer: lines.join('\n'),
          movies: hydrated,
          intent: 'SYSTEM_STATS',
          statType,
        };
      }

      if (statType === 'movie_count') {
        const count = await this.dataSource.getRepository(Movie).count();
        return {
          answer: `Hiện tại hệ thống Moviere đang quản lý cơ sở dữ liệu gồm **${count} bộ phim** thuộc nhiều thể loại đa dạng. Bạn có thể yêu cầu tôi gợi ý phim theo sở thích bất cứ lúc nào!`,
          movies: [],
          intent: 'SYSTEM_STATS',
          statType,
        };
      }

      // Default thống kê chung: Lấy 5 phim có điểm đánh giá cao
      const topGeneral = await this.dataSource
        .getRepository(Movie)
        .createQueryBuilder('movie')
        .orderBy('movie.voteAverage', 'DESC')
        .limit(5)
        .getMany();

      const hydrated = plainToInstance(
        SimilarMovieResponseDto,
        topGeneral.map((m, idx) => ({ ...m, score: 0, rank: idx + 1 })),
        { excludeExtraneousValues: true },
      );

      return {
        answer:
          'Hệ thống Moviere tổng hợp đầy đủ các dữ liệu về phim, lượt xem, đánh giá và bình luận. Dưới đây là một số bộ phim tiêu biểu trong hệ thống:',
        movies: hydrated,
        intent: 'SYSTEM_STATS',
        statType: 'general',
      };
    } catch (err) {
      this.logger.error('Lỗi khi truy vấn thống kê hệ thống:', err);
      return {
        answer:
          'Hiện tại chức năng thống kê hệ thống đang được cập nhật, vui lòng thử lại sau.',
        movies: [],
        intent: 'SYSTEM_STATS',
        statType,
      };
    }
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
    const uniqueItems = items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    const itemIds = uniqueItems.map((item) => item.id);
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
