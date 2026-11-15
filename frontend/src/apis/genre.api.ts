import { ApiPaginatedResponse, ApiResponse, Genre } from '@/shared/types/api.types';
import { withListParams, type SearchListParams } from '@/shared/utils/list-params';
import axiosClient from '../lib/axiosClient';

/** Query params `GET /genres` — khớp `BaseSearchRequest`. */
export type GenreQuery = SearchListParams;

export const genreApi = {
  getAll: async (params: GenreQuery = {}): Promise<ApiPaginatedResponse<Genre[]>> => {
    const { data } = await axiosClient.get(withListParams('/genres', params));
    return data;
  },
  getById: async (id: string): Promise<ApiResponse<Genre>> => {
    const { data } = await axiosClient.get(`/genres/${id}`);
    return data;
  },
  create: async (genre: Partial<Genre>): Promise<ApiResponse<Genre>> => {
    const { data } = await axiosClient.post('/genres', genre);
    return data;
  },
  /** Cập nhật (ADMIN) — backend nhận `PATCH` (khớp `genres.controller.ts`). */
  update: async (id: string, genre: Partial<Genre>): Promise<ApiResponse<Genre>> => {
    const { data } = await axiosClient.patch(`/genres/${id}`, genre);
    return data;
  },
  delete: async (id: string): Promise<ApiResponse<null>> => {
    const { data } = await axiosClient.delete(`/genres/${id}`);
    return data;
  },
};
