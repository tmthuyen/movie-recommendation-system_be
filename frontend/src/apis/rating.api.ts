import { ApiPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import { Rating } from '@/shared/types/rating.types';
import axiosClient from '../lib/axiosClient';

export const ratingApi = {
  /** Đánh giá sao (JWT) — body `{ rating: 0–5, movieId }`; user chỉ đánh giá 1 lần/phim. */
  create: async (input: {
    rating: number;
    movieId: number | string;
  }): Promise<ApiResponse<Rating>> => {
    const { data } = await axiosClient.post('/ratings', input);
    return data;
  },
  /** Đánh giá của một phim (public) — `page`/`limit`, join `user`. */
  getByMovie: async (
    movieId: number | string,
    params: { page?: number; limit?: number } = {}
  ): Promise<ApiPaginatedResponse<Rating[]>> => {
    const { data } = await axiosClient.get(`/ratings/movie/${movieId}`, { params });
    return data;
  },
};
