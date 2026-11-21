import { Inject, Injectable, Logger } from '@nestjs/common';
import { CacheKeys } from './cache.keys';
import {
  GENRE_MATRIX_TTL_SECONDS,
  TOP_MOVIES_PER_GENRE,
} from './genre-stats.constants';
import {
  IGENRE_MOVIE_REPOSITORY,
  type IGenreMovieRepository,
} from './genre-movie.repository';
import {
  REDIS_SERVICE,
  type IRedisService,
  type RedisSetReplacement,
  type RedisSortedSetReplacement,
} from '@/infrastructure/redis/redis.service';

export interface GenreMatrixBuildStats {
  genreCount: number;
  movieCount: number;
  popularEntryCount: number;
}

interface ScoredMovie {
  movieId: number;
  score: number;
}

/** Xây 3 key Redis mô tả ma trận thể loại cho AI service đọc trực tiếp. */
@Injectable()
export class GenreStatsCacheService {
  private readonly logger = new Logger(GenreStatsCacheService.name);

  constructor(
    @Inject(REDIS_SERVICE) private readonly redis: IRedisService,
    @Inject(IGENRE_MOVIE_REPOSITORY)
    private readonly genreMovieRepo: IGenreMovieRepository,
  ) {}

  /**
   * Đọc mapping genre/phim và điểm phổ biến, rồi ghi 2 key genre lên Redis.
   * Top 100 movieId theo viewCount được ghi vào ZSET genre tương ứng với score cố định 1.
   * @returns Thống kê số genre, số phim và số phim có điểm phổ biến.
   */
  async buildGenreMatrices(): Promise<GenreMatrixBuildStats> {
    const [popular, mappings] = await Promise.all([
      this.redis.zrevrangeWithScores(CacheKeys.stats.popular(), 0, -1),
      this.genreMovieRepo.findAllMovieGenreMappings(),
    ]);

    const scoreByMovie = new Map<number, number>();
    for (const item of popular) {
      const movieId = Number(item.member);
      if (
        !Number.isSafeInteger(movieId) ||
        movieId <= 0 ||
        !Number.isFinite(item.score)
      ) {
        continue;
      }
      // popular:all đã xếp theo điểm giảm dần; giữ điểm đầu tiên.
      if (!scoreByMovie.has(movieId)) scoreByMovie.set(movieId, item.score);
    }

    const allGenreIds = new Set<number>();
    const scoresByGenre = new Map<number, ScoredMovie[]>();
    for (const { movieId, genreIds } of mappings) {
      const score = scoreByMovie.get(movieId);
      for (const genreId of new Set(genreIds)) {
        allGenreIds.add(genreId);
        if (score === undefined) continue;

        const list = scoresByGenre.get(genreId) ?? [];
        list.push({ movieId, score });
        scoresByGenre.set(genreId, list);
      }
    }

    const sortedGenreIds = Array.from(allGenreIds).sort((a, b) => a - b);
    const sets: RedisSetReplacement[] = [
      {
        key: CacheKeys.stats.genreIds(),
        members: sortedGenreIds.map(String),
      },
    ];
    const sortedSets: RedisSortedSetReplacement[] = sortedGenreIds.map(
      genreId => ({
        key: CacheKeys.stats.genreMovies(genreId),
        entries: (scoresByGenre.get(genreId) ?? [])
          .slice()
          .sort((a, b) => b.score - a.score || a.movieId - b.movieId)
          .slice(0, TOP_MOVIES_PER_GENRE)
          .map(({ movieId }) => ({
            member: String(movieId),
            score: 1,
          })),
      }),
    );

    await this.redis.replaceCollections(
      sets,
      sortedSets,
      GENRE_MATRIX_TTL_SECONDS,
    );

    const stats: GenreMatrixBuildStats = {
      genreCount: sortedGenreIds.length,
      movieCount: mappings.length,
      popularEntryCount: scoreByMovie.size,
    };
    this.logger.log(
      `Đã refresh ma trận thể loại: ${stats.genreCount} genres, ${stats.movieCount} movies, ${stats.popularEntryCount} popular entries`,
    );
    return stats;
  }
}
