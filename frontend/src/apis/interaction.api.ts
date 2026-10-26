import { ApiPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import {
  Interaction,
  InteractionStats,
  ToggleInteractionResult,
} from '@/shared/types/interaction.types';
import axiosClient from '../lib/axiosClient';

export const interactionApi = {
  /** TOGGLE yêu thích (JWT) — body `{ type: 'like', movieId }`, gọi lại để bỏ. */
  toggle: async (input: {
    type: 'like';
    movieId: number | string;
  }): Promise<ApiResponse<ToggleInteractionResult>> => {
    const { data } = await axiosClient.post('/interactions', input);
    return data;
  },
  /** Thống kê tương tác realtime của phim (public). */
  getStats: async (movieId: number | string): Promise<ApiResponse<InteractionStats>> => {
    const { data } = await axiosClient.get(`/interactions/stats/${movieId}`);
    return data;
  },
  /** Lịch sử xem phim của user (JWT) — chỉ `type=click`. */
  getMyHistory: async (params: {
    page?: number;
    limit?: number;
  }): Promise<ApiPaginatedResponse<Interaction[]>> => {
    const { data } = await axiosClient.get('/interactions/my-history', { params });
    return data;
  },
  /** Danh sách phim yêu thích của user (JWT) — chỉ `type=like`. */
  getMyFavorites: async (params: {
    page?: number;
    limit?: number;
  }): Promise<ApiPaginatedResponse<Interaction[]>> => {
    const { data } = await axiosClient.get('/interactions/my-favorites', { params });
    return data;
  },
  /** Toàn bộ tương tác (public, admin) — `{page, limit}`, join `user` + `movie`. */
  getAll: async (params: {
    page?: number;
    limit?: number;
  }): Promise<ApiPaginatedResponse<Interaction[]>> => {
    const { data } = await axiosClient.get('/interactions', { params });
    return data;
  },
  /** Xóa tương tác (JWT). */
  remove: async (id: number | string): Promise<ApiResponse<null>> => {
    const { data } = await axiosClient.delete(`/interactions/${id}`);
    return data;
  },
};
