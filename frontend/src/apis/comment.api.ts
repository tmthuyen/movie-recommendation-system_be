import { ApiPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import { Comment } from '@/shared/types/comment.types';
import { withListParams, type SearchListParams } from '@/shared/utils/list-params';
import { toInteractionGenres, type InteractionGenrePayload } from '@/shared/utils/movie';
import axiosClient from '../lib/axiosClient';

export const commentApi = {
  /** Thêm bình luận (JWT) — body `{ content, movieId, parentId?, genres? }`. */
  create: async (input: {
    content: string;
    movieId: number | string;
    parentId?: number | string;
    genres?: InteractionGenrePayload[];
  }): Promise<ApiResponse<Comment>> => {
    const { genres, ...rest } = input;
    const normalizedGenres = toInteractionGenres(genres);
    const { data } = await axiosClient.post('/comments', {
      ...rest,
      ...(normalizedGenres ? { genres: normalizedGenres } : {}),
    });
    return data;
  },
  /**
   * Bình luận của một phim (public) — không truyền `parentId` → root;
   * truyền `parentId` → các reply trực tiếp của comment đó.
   */
  getByMovie: async (
    movieId: number | string,
    params: { page?: number; limit?: number; parentId?: number | string } = {},
  ): Promise<ApiPaginatedResponse<Comment[]>> => {
    const { page, limit, parentId } = params;
    const { data } = await axiosClient.get(`/comments/movie/${movieId}`, {
      params: { page, limit, parentId },
    });
    return data;
  },
  /** Toàn bộ bình luận (public, admin) — `BaseSearchRequest`, join `user` + `movie`. */
  getAll: async (params: SearchListParams = {}): Promise<ApiPaginatedResponse<Comment[]>> => {
    const { data } = await axiosClient.get(withListParams('/comments', params));
    return data;
  },
  /** Xóa bình luận (ADMIN). */
  remove: async (id: number | string): Promise<ApiResponse<null>> => {
    const { data } = await axiosClient.delete(`/comments/${id}`);
    return data;
  },
};
