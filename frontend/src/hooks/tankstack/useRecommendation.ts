import { recommendationApi } from '@/apis/recommendation.api';
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

/** Query key dùng chung cho infinite similar (cần khi reset do cursor hết hạn). */
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

// api/recommendations/for-you?topK=20
export function useForYou(
  params?: { topK?: number },
  staleTime: number = 1000 * 60 * 5,
  gcTime: number = 1000 * 60 * 10,
) {
  return useQuery({
    queryKey: ['recommendations', 'for-you', params?.topK],
    queryFn: async () => {
      const response = await recommendationApi.forYou(params);
      return response.result;
    },
    staleTime: staleTime, // 5 phút
    gcTime: gcTime, // 10 phút
  });
}

const useRecommendation = {
  useGetSimilarMovies,
  useGetSimilarMoviesInfinite,
  useSemanticSearch,
  useForYou,
};

export default useRecommendation;
