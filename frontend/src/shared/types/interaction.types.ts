import { BaseDto } from './api.types';
import { Movie } from './movie.types';

/**
 * Kiểu tương tác — khớp enum `InteractionType` của backend
 * (`like`, `rating`, `comment`, `click`).
 */
export type InteractionType = 'like' | 'rating' | 'comment' | 'click';

/**
 * Tương tác — `GET /api/interactions*`.
 *
 * Lưu ý: `movieId`/`user` chỉ có ở các endpoint join `movie`/`user`
 * (`my-history`, `my-favorites`).
 */
export interface Interaction extends BaseDto {
  id: number;
  score: number;
  type: InteractionType;
  user?: { id: string; fullName?: string; email?: string; avatarUrl?: string };
  movie?: Movie;
  movieId?: number | string;
}

/**
 * Kết quả `POST /api/interactions` — **TOGGLE like**: gọi 1 lần để bật,
 * gọi lại để tắt → đọc `action` (`added`/`removed`).
 *
 * `score` là độ tin cậy backend tự tính (band 5) — **không hiển thị** cho user.
 */
export interface ToggleInteractionResult {
  success?: boolean;
  action: 'added' | 'removed';
  type: InteractionType;
  score: number;
  likeCount: number;
  data?: Interaction;
}

/** `GET /api/interactions/stats/:movieId` — thống kê realtime của phim. */
export interface InteractionStats {
  movieId: number | string;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  ratingCount: number;
  voteAverage: number;
}
