import { Movie } from '@/shared/types/movie.types';

/**
 * Dựng URL ảnh TMDB từ `posterPath`/`backdropPath` (path tương đối dạng `/abc.jpg`).
 * Base URL cấu hình qua `NEXT_PUBLIC_TMDB_IMAGE_BASE_URL`, mặc định là TMDB public.
 */
const TMDB_IMAGE_BASE_URL =
  process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p';

export type TmdbImageSize = 'w200' | 'w342' | 'w500' | 'w780' | 'original';

export function getTmdbImageUrl(path?: string | null, size: TmdbImageSize = 'w500'): string | null {
  if (!path) return null;
  return `${TMDB_IMAGE_BASE_URL}/${size}${path}`;
}

export function getPosterUrl(path?: string | null): string | null {
  return getTmdbImageUrl(path, 'w500');
}

export function getBackdropUrl(path?: string | null): string | null {
  return getTmdbImageUrl(path, 'w780');
}

/** Tiêu đề hiển thị: ưu tiên tiếng Việt, fallback tiếng Anh. */
export function getMovieTitle(movie: Pick<Movie, 'titleVi' | 'title'>): string {
  return movie.titleVi || movie.title || 'Chưa có tiêu đề';
}

/** Lấy năm phát hành từ `releaseDate` (định dạng `YYYY-MM-DD`). */
export function getReleaseYear(releaseDate?: string | null): string {
  if (!releaseDate) return '';
  return releaseDate.slice(0, 4);
}

/** Payload genre tối giản đúng contract DTO backend (`id`, `name`). */
export interface InteractionGenrePayload {
  id: number;
  name: string;
}

/**
 * Chỉ giữ `id`/`name` khi gửi genre lên API tương tác.
 * Tránh `enName` hoặc field thừa làm ValidationPipe `forbidNonWhitelisted` trả lỗi.
 *
 * @returns Mảng genre sạch, hoặc `undefined` khi không có genre.
 */
export function toInteractionGenres(
  genres?: Array<{ id: number | string; name: string }>,
): InteractionGenrePayload[] | undefined {
  if (!genres || genres.length === 0) return undefined;
  return genres.map((genre) => ({
    id: Number(genre.id),
    name: genre.name,
  }));
}

export const movieUtil = {
  getTmdbImageUrl,
  getPosterUrl,
  getBackdropUrl,
  getMovieTitle,
  getReleaseYear,
  toInteractionGenres,
};
