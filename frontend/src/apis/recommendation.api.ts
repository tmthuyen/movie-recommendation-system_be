import { ApiCursorPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import { MovieWithSimilarScore } from '@/shared/types/movie.types';
import axiosClient from '@/lib/axiosClient';

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

  // api/recommendations/hybrid-search?userId=...&keyword=...&topK=10&page=1&pageSize=10
  // params: userId, keyword, topK, page, pageSize
  hybridSearch: async (params?: {
    userId: string;
    keyword?: string;
    topK?: number;
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<MovieWithSimilarScore[]>> => {
    const { data } = await axiosClient.get(`/recommendations/hybrid-search`, {
      params: { ...params },
    });
    return data;
  },
};
