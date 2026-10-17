import { ApiPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import {
  Interaction,
  InteractionType,
  ToggleInteractionResult,
} from '@/shared/types/interaction.types';
import axiosClient from '../lib/axiosClient';

export const interactionApi = {
  /** TOGGLE tương tác (JWT) — body `{ type, movieId }`, gọi lại để tắt. */
  toggle: async (input: {
    type: InteractionType;
    movieId: number | string;
  }): Promise<ApiResponse<ToggleInteractionResult>> => {
    const { data } = await axiosClient.post('/interactions', input);
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
  /** Danh sách yêu thích của user (JWT) — `type ∈ like, favorite, watchlist`. */
  getMyFavorites: async (params: {
    page?: number;
    limit?: number;
  }): Promise<ApiPaginatedResponse<Interaction[]>> => {
    const { data } = await axiosClient.get('/interactions/my-favorites', { params });
    return data;
  },
};
