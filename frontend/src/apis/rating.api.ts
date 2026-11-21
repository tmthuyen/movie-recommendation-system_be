import { ApiPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import { Rating } from '@/shared/types/rating.types';
import { withListParams, type SearchListParams } from '@/shared/utils/list-params';
import { toInteractionGenres, type InteractionGenrePayload } from '@/shared/utils/movie';
import axiosClient from '../lib/axiosClient';

export const ratingApi = {
  /** Đánh giá sao (JWT) — body `{ rating: 0–5, movieId, genres? }`; user chỉ đánh giá 1 lần/phim. */
  create: async (input: {
    rating: number;
    movieId: number;
    genres?: InteractionGenrePayload[];
  }): Promise<ApiResponse<Rating>> => {
    const { genres, ...rest } = input;
    const normalizedGenres = toInteractionGenres(genres);
    const { data } = await axiosClient.post('/ratings', {
      ...rest,
      ...(normalizedGenres ? { genres: normalizedGenres } : {}),
    });
    return data;
  },
  /** Đánh giá của một phim (public) — `page`/`limit`, join `user`. */
  getByMovie: async (
    movieId: number,
    params: { page?: number; limit?: number } = {},
  ): Promise<ApiPaginatedResponse<Rating[]>> => {
    const { data } = await axiosClient.get(`/ratings/movie/${movieId}`, { params });
    return data;
  },
  /** Toàn bộ đánh giá (public, admin) — `BaseSearchRequest`, join `user` + `movie`. */
  getAll: async (params: SearchListParams = {}): Promise<ApiPaginatedResponse<Rating[]>> => {
    const { data } = await axiosClient.get(withListParams('/ratings', params));
    return data;
  },
  /** Xóa đánh giá (ADMIN). */
  remove: async (id: number): Promise<ApiResponse<null>> => {
    const { data } = await axiosClient.delete(`/ratings/${id}`);
    return data;
  },
};
