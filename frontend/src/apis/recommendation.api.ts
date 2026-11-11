import { ApiCursorPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import { MovieWithHybridScore, MovieWithSimilarScore } from '@/shared/types/movie.types';
import axiosClient from '@/lib/axiosClient';
import qs from 'qs';

export interface GenreQuery {
  page?: number;
  limit?: number;
  keyword?: string;
}

export const recommendationApi = {
  /**
   * /api/recommendations/similar/:movieId?topK=10
   * @param params
   * @returns
   */
  getSimilarMovies: async (
    movieId: string,
    params?: { topK?: number },
  ): Promise<ApiResponse<MovieWithSimilarScore[]>> => {
    const { data } = await axiosClient.get(`/recommendations/similar/${movieId}`, { params });
    return data;
  },

  /**
   * /api/recommendations/similar/:movieId/cursor?limit=12&cursor=...
   * `cursor` bỏ trống ở trang đầu; dùng `pagination.nextCursor` cho trang kế.
   */
  getSimilarMoviesCursor: async (
    movieId: string,
    params?: { cursor?: string; limit?: number },
  ): Promise<ApiCursorPaginatedResponse<MovieWithSimilarScore[]>> => {
    const { data } = await axiosClient.get(`/recommendations/similar/${movieId}/cursor`, {
      params,
    });
    return data;
  },

  // api/recommendations/semantic-search?query=...&topK=10
  semanticSearch: async (params?: {
    query: string;
    topK?: number;
  }): Promise<ApiResponse<MovieWithSimilarScore[]>> => {
    const { data } = await axiosClient.get(`/recommendations/semantic-search`, {
      params: { ...params },
    });
    return data;
  },

  // api/recommendations/for-you?topK=20
  // params: topK
  forYou: async (params?: { topK?: number }): Promise<ApiResponse<MovieWithHybridScore[]>> => {
    const queryParams = qs.stringify(params, { addQueryPrefix: true });
    const { data } = await axiosClient.get(`/recommendations/for-you${queryParams}`);
    return data;
  },
};
