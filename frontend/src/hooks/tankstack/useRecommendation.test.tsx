import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { recommendationApi } from '@/apis/recommendation.api';
import {
  useGetSimilarMovies,
  useHybridRecommendations,
  useSemanticSearch,
} from './useRecommendation';

vi.mock('@/apis/recommendation.api', () => ({
  recommendationApi: {
    getSimilarMovies: vi.fn(),
    semanticSearch: vi.fn(),
    hybridSearch: vi.fn(),
  },
}));

const similarMovies = [
  {
    id: 2,
    title: 'Dune: Part Two',
    titleVi: 'Dune: Hành Tinh Cát 2',
    similarScore: 0.92,
  },
];

const apiResponse = (result: unknown) => ({
  success: true,
  statusCode: 200,
  message: 'OK',
  result,
});

let queryClient: QueryClient;

const createWrapper = () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

describe('useGetSimilarMovies', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(recommendationApi.getSimilarMovies).mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('gọi API với movieId dạng string + params topK và trả result', async () => {
    vi.mocked(recommendationApi.getSimilarMovies).mockResolvedValue(
      apiResponse(similarMovies) as any,
    );

    const { result } = renderHook(() => useGetSimilarMovies(7, { topK: 3 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(recommendationApi.getSimilarMovies).toHaveBeenCalledWith('7', { topK: 3 });
    expect(result.current.data).toEqual(similarMovies);
    expect(result.current.isStale).toBe(false);
  });

  it('không truyền params khi không có topK', async () => {
    vi.mocked(recommendationApi.getSimilarMovies).mockResolvedValue(apiResponse([]) as any);

    const { result } = renderHook(() => useGetSimilarMovies(12), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(recommendationApi.getSimilarMovies).toHaveBeenCalledWith('12', undefined);
  });

  it('đưa lỗi vào state khi API thất bại', async () => {
    vi.mocked(recommendationApi.getSimilarMovies).mockRejectedValue(new Error('AI service down'));

    const { result } = renderHook(() => useGetSimilarMovies(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('AI service down');
    expect(result.current.data).toBeUndefined();
  });

  it('dùng chung cache theo queryKey (movieId + topK)', async () => {
    vi.mocked(recommendationApi.getSimilarMovies).mockResolvedValue(
      apiResponse(similarMovies) as any,
    );
    const wrapper = createWrapper();

    const first = renderHook(() => useGetSimilarMovies(5, { topK: 2 }), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));

    const second = renderHook(() => useGetSimilarMovies(5, { topK: 2 }), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    expect(recommendationApi.getSimilarMovies).toHaveBeenCalledTimes(1);
  });
});

describe('useSemanticSearch', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(recommendationApi.semanticSearch).mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('truyền query + topK xuống API', async () => {
    vi.mocked(recommendationApi.semanticSearch).mockResolvedValue(apiResponse(similarMovies) as any);

    const { result } = renderHook(() => useSemanticSearch({ query: 'phim vũ trụ', topK: 5 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(recommendationApi.semanticSearch).toHaveBeenCalledWith({
      query: 'phim vũ trụ',
      topK: 5,
    });
    expect(result.current.data).toEqual(similarMovies);
  });

  it('gọi API với params undefined vẫn hoạt động', async () => {
    vi.mocked(recommendationApi.semanticSearch).mockResolvedValue(apiResponse([]) as any);

    const { result } = renderHook(() => useSemanticSearch(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(recommendationApi.semanticSearch).toHaveBeenCalledWith(undefined);
  });
});

describe('useHybridRecommendations', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(recommendationApi.hybridSearch).mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('truyền đầy đủ params phân trang/từ khoá và trả result', async () => {
    vi.mocked(recommendationApi.hybridSearch).mockResolvedValue(apiResponse(similarMovies) as any);
    const params = { userId: 'u1', keyword: 'dune', topK: 10, page: 2, pageSize: 20 };

    const { result } = renderHook(() => useHybridRecommendations(params), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(recommendationApi.hybridSearch).toHaveBeenCalledWith(params);
    expect(result.current.data).toEqual(similarMovies);
  });

  it('đưa lỗi vào state khi API thất bại', async () => {
    vi.mocked(recommendationApi.hybridSearch).mockRejectedValue(new Error('timeout'));

    const { result } = renderHook(() => useHybridRecommendations({ userId: 'u1' }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('timeout');
  });
});
