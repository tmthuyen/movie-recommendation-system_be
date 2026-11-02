import { recommendationApi } from '@/apis/recommendation.api';
import { parseAxiosError } from '@/lib/axiosClient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

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

// api/recommendations/hybrid
export function useHybridRecommendations(
  params?: { userId: string; keyword?: string; topK?: number; page?: number; pageSize?: number },
  staleTime: number = 1000 * 60 * 5,
  gcTime: number = 1000 * 60 * 10,
) {
  return useQuery({
    queryKey: [
      'recommendations',
      'hybrid',
      params?.userId,
      params?.keyword,
      params?.topK,
      params?.page,
      params?.pageSize,
    ],
    queryFn: async () => {
      const response = await recommendationApi.hybridSearch(params);
      return response.result;
    },
    staleTime: staleTime, // 5 phút
    gcTime: gcTime, // 10 phút
  });
}

const useRecommendation = {
  useGetSimilarMovies,
  useSemanticSearch,
  useHybridRecommendations,
};

export default useRecommendation;
