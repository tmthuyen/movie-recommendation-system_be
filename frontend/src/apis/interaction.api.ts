import { ApiPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import {
  Interaction,
  InteractionStats,
  MyInteractionsWithMovie,
  ToggleInteractionResult,
} from '@/shared/types/interaction.types';
import { withListParams, type SearchListParams } from '@/shared/utils/list-params';
import { toInteractionGenres, type InteractionGenrePayload } from '@/shared/utils/movie';
import axiosClient from '../lib/axiosClient';

export const interactionApi = {
  /**
   * TOGGLE yêu thích (JWT) — body `{ type: 'like', movieId, genres? }`.
   * Genre của phim được gửi kèm để backend phát event cập nhật user genre vector.
   * @returns Envelope kết quả toggle; backend tự quyết added/removed.
   */
  toggleLike: async (input: {
    type: 'like';
    movieId: number;
    genres?: InteractionGenrePayload[];
  }): Promise<ApiResponse<ToggleInteractionResult>> => {
    const genres = toInteractionGenres(input.genres);
    const { data } = await axiosClient.post('/interactions', {
      type: input.type,
      movieId: input.movieId,
      ...(genres ? { genres } : {}),
    });
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
  /** Danh sách tương tác của user với movie cụ thể
   * @param movieId - ID của movie
   */
  getInteractionsWithMovie: async (
    movieId: number,
  ): Promise<ApiPaginatedResponse<MyInteractionsWithMovie>> => {
    const { data } = await axiosClient.get(`/interactions/movie/${movieId}/me`);
    return data;
  },
  /** Toàn bộ tương tác (public, admin) — `BaseSearchRequest`, join `user` + `movie`. */
  getAll: async (params: SearchListParams = {}): Promise<ApiPaginatedResponse<Interaction[]>> => {
    const { data } = await axiosClient.get(withListParams('/interactions', params));
    return data;
  },
  /** Xóa tương tác (JWT). */
  remove: async (id: number | string): Promise<ApiResponse<null>> => {
    const { data } = await axiosClient.delete(`/interactions/${id}`);
    return data;
  },
};
