import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Movie } from '@/modules/movies/entities/movie.entity';

export const IGENRE_MOVIE_REPOSITORY = 'IGENRE_MOVIE_REPOSITORY';

export interface MovieGenreMapping {
  movieId: number;
  genreIds: number[];
}

export interface IGenreMovieRepository {
  findAllMovieGenreMappings(): Promise<MovieGenreMapping[]>;
}

function toPositiveId(value: string | number): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** Đọc quan hệ movie_genres để tạo ma trận thể loại phục vụ AI service. */
@Injectable()
export class GenreMovieRepository implements IGenreMovieRepository {
  constructor(private readonly dataSource: DataSource) {}

  async findAllMovieGenreMappings(): Promise<MovieGenreMapping[]> {
    const rows = await this.dataSource
      .getRepository(Movie)
      .createQueryBuilder('movie')
      .innerJoin('movie.genres', 'genre')
      .select('movie.id', 'movieId')
      .addSelect('genre.id', 'genreId')
      .orderBy('movie.id', 'ASC')
      .addOrderBy('genre.id', 'ASC')
      .getRawMany<{ movieId: string | number; genreId: string | number }>();

    const byMovie = new Map<number, Set<number>>();
    for (const row of rows) {
      const movieId = toPositiveId(row.movieId);
      const genreId = toPositiveId(row.genreId);
      if (movieId === null || genreId === null) continue;

      const genreIds = byMovie.get(movieId) ?? new Set<number>();
      genreIds.add(genreId);
      byMovie.set(movieId, genreIds);
    }

    return Array.from(byMovie.entries()).map(([movieId, genreIds]) => ({
      movieId,
      genreIds: Array.from(genreIds),
    }));
  }
}
