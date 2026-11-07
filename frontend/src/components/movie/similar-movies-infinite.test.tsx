import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  similarInfiniteQueryKey,
  useGetSimilarMoviesInfinite,
} from '@/hooks/tankstack/useRecommendation';
import { parseAxiosError } from '@/lib/axiosClient';
import { SimilarMoviesInfinite } from './similar-movies-infinite';

vi.mock('@/hooks/tankstack/useRecommendation', () => ({
  similarInfiniteQueryKey: (movieId: number, limit?: number) =>
    ['recommendations', 'similar', 'infinite', movieId, limit] as const,
  useGetSimilarMoviesInfinite: vi.fn(),
}));

vi.mock('@/lib/axiosClient', () => ({
  parseAxiosError: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('SimilarMoviesInfinite', () => {
  beforeEach(() => {
    vi.mocked(useGetSimilarMoviesInfinite).mockReset();
    vi.mocked(parseAxiosError).mockReset();
    vi.mocked(toast.info).mockReset();
  });

  it('reset infinite query khi cursor hết hạn (409)', async () => {
    const error = new Error('cursor expired');
    vi.mocked(parseAxiosError).mockReturnValue({
      statusCode: 409,
      message: 'Cursor đã hết hạn',
    });
    vi.mocked(useGetSimilarMoviesInfinite).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error,
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetSimilarMoviesInfinite>);

    const queryClient = new QueryClient();
    const resetSpy = vi.spyOn(queryClient, 'resetQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <SimilarMoviesInfinite movieId={7} />
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(resetSpy).toHaveBeenCalledWith({
        queryKey: similarInfiniteQueryKey(7, 12),
      }),
    );
    expect(toast.info).toHaveBeenCalledWith('Danh sách gợi ý đã thay đổi, đang tải lại từ đầu.');
  });

  it('không reset khi lỗi không phải 409', async () => {
    vi.mocked(parseAxiosError).mockReturnValue({
      statusCode: 500,
      message: 'Lỗi máy chủ',
    });
    vi.mocked(useGetSimilarMoviesInfinite).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('server error'),
      hasNextPage: false,
      isFetchingNextPage: false,
      isFetchNextPageError: false,
      fetchNextPage: vi.fn(),
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useGetSimilarMoviesInfinite>);

    const queryClient = new QueryClient();
    const resetSpy = vi.spyOn(queryClient, 'resetQueries');

    render(
      <QueryClientProvider client={queryClient}>
        <SimilarMoviesInfinite movieId={7} />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(parseAxiosError).toHaveBeenCalled());
    expect(resetSpy).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });
});
