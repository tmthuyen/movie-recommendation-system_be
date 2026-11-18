import { recommendationApi } from '@/apis/recommendation.api';
import { useAuthStore } from '@/stores/auth.store';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

// /api/recommendations/similar/:movieId?top_k=10
export function useGetSimilarMovies(
  movieId: number,
  params?: { topK?: number },
  staleTime: number = 1000 * 60 * 5,
  gcTime: number = 1000 * 60 * 10,
) {
  return useQuery({
    queryKey: ['recommendations', 'similar', movieId, params?.topK],
    queryFn: async () => {
      const response = await recommendationApi.getSimilarMovies(String(movieId), params);
      return response.result;
    },

    staleTime: staleTime, // 5 phút
    gcTime: gcTime, // 10 phút
  });
}

/** Query key của truy vấn phim tương tự phân trang theo cursor. */
export const similarInfiniteQueryKey = (movieId: number, limit?: number) =>
  ['recommendations', 'similar', 'infinite', movieId, limit] as const;

// /api/recommendations/similar/:movieId/cursor?limit=12&cursor=...
export function useGetSimilarMoviesInfinite(
  movieId: number,
  params?: { limit?: number },
  staleTime: number = 1000 * 60 * 5,
  gcTime: number = 1000 * 60 * 10,
) {
  return useInfiniteQuery({
    queryKey: similarInfiniteQueryKey(movieId, params?.limit),
    queryFn: ({ pageParam }) =>
      recommendationApi.getSimilarMoviesCursor(String(movieId), {
        cursor: pageParam,
        limit: params?.limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? (lastPage.pagination.nextCursor ?? undefined) : undefined,
    staleTime,
    gcTime,
    enabled: movieId > 0,
  });
}

// api/recommendations/semantic-search?query=...&topK=10
export function useSemanticSearch(
  params?: { query: string; topK?: number },
  staleTime: number = 1000 * 60 * 5,
  gcTime: number = 1000 * 60 * 10,
) {
  return useQuery({
    queryKey: ['recommendations', 'semantic-search', params?.query, params?.topK],
    queryFn: async () => {
      const response = await recommendationApi.semanticSearch(params);
      return response.result;
    },
    staleTime: staleTime, // 5 phút
    gcTime: gcTime, // 10 phút
  });
}

/** Chế độ tìm kiếm phim. */
export type RecommendationSearchMode = 'semantic' | 'rerank' | 'lexical';

/** Query key của truy vấn tìm kiếm phân trang theo cursor. */
export const searchInfiniteQueryKey = (
  mode: RecommendationSearchMode,
  keyword: string,
  limit?: number,
) => ['recommendations', 'search', mode, keyword, limit] as const;

/**
 * Truy vấn tìm kiếm phim phân trang theo cursor.
 * @param params.mode Chế độ tìm kiếm: `semantic`, `rerank` hoặc `lexical`.
 * @param params.keyword Từ khóa tìm kiếm.
 * @param params.limit Số phim mỗi trang.
 * @param staleTime Thời gian dữ liệu được coi là mới (ms).
 * @param gcTime Thời gian giữ dữ liệu trong cache (ms).
 * @returns Kết quả `useInfiniteQuery` của danh sách phim.
 */
export function useSearchMoviesInfinite(
  params: { mode: RecommendationSearchMode; keyword: string; limit?: number },
  staleTime: number = 1000 * 60 * 5,
  gcTime: number = 1000 * 60 * 10,
) {
  const { mode, keyword, limit = 12 } = params;

  return useInfiniteQuery({
    queryKey: searchInfiniteQueryKey(mode, keyword, limit),
    queryFn: ({ pageParam }) => {
      const query = { keyword, cursor: pageParam as string | undefined, limit };
      switch (mode) {
        case 'rerank':
          return recommendationApi.searchRerankCursor(query);
        case 'lexical':
          return recommendationApi.lexicalSearchCursor(query);
        default:
          return recommendationApi.semanticSearchCursor(query);
      }
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? (lastPage.pagination.nextCursor ?? undefined) : undefined,
    enabled: keyword.trim().length > 0,
    staleTime,
    gcTime,
  });
}

// api/recommendations/for-you?topK=20
export function useForYou(
  params?: { topK?: number; enabled?: boolean },
  staleTime: number = 1000 * 60 * 5,
  gcTime: number = 1000 * 60 * 10,
) {
  return useQuery({
    queryKey: ['recommendations', 'for-you', params?.topK],
    queryFn: async () => {
      const apiParams = { ...params };
      delete apiParams.enabled;
      const response = await recommendationApi.forYou(apiParams);
      return response.result;
    },
    enabled: params?.enabled ?? true,
    staleTime: staleTime, // 5 phút
    gcTime: gcTime, // 10 phút
  });
}

/** Query key của truy vấn gợi ý cá nhân hoá phân trang theo cursor. */
export const forYouInfiniteQueryKey = (limit?: number) =>
  ['recommendations', 'for-you', 'infinite', limit] as const;

/** Truy vấn gợi ý cá nhân hoá phân trang theo cursor; chỉ bật khi đã đăng nhập. */
export function useForYouInfinite(
  limit: number = 12,
  staleTime: number = 1000 * 60 * 5,
  gcTime: number = 1000 * 60 * 10,
) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return useInfiniteQuery({
    queryKey: forYouInfiniteQueryKey(limit),
    queryFn: ({ pageParam }) =>
      recommendationApi.forYouCursor({
        cursor: pageParam as string | undefined,
        limit,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.pagination.hasMore ? (lastPage.pagination.nextCursor ?? undefined) : undefined,
    enabled: isAuthenticated,
    staleTime,
    gcTime,
  });
}

const useRecommendation = {
  useGetSimilarMovies,
  useGetSimilarMoviesInfinite,
  useSemanticSearch,
  useSearchMoviesInfinite,
  useForYou,
  useForYouInfinite,
};

export default useRecommendation;
