import { ApiPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import { Movie, MovieDetail, MovieQuery } from '@/shared/types/movie.types';
import axiosClient from '../lib/axiosClient';

export const movieApi = {
  /** Danh sách phim (public) — chỉ nhận `page`/`limit`/`keyword`. */
  getAll: async (params: MovieQuery = {}): Promise<ApiPaginatedResponse<Movie[]>> => {
    const { data } = await axiosClient.get('/movies', { params });
    return data;
  },
  /** Chi tiết phim theo id (public). */
  getById: async (id: number | string): Promise<ApiResponse<MovieDetail>> => {
    const { data } = await axiosClient.get(`/movies/${id}`);
    return data;
  },
  /** Tăng lượt xem cho phim (public, optional auth). */
  incrementView: async (id: number | string): Promise<ApiResponse<{ viewCount: number }>> => {
    const { data } = await axiosClient.post(`/movies/${id}/view`);
    return data;
  },
};
