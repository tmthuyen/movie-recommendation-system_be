import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { movieApi } from '@/apis/movie.api';
import {
  useGetMovieDetail,
  useGetMovies,
  useIncrementView,
  useLatestMovies,
  useSearchMovies,
} from './useMovie';

vi.mock('@/apis/movie.api', () => ({
  movieApi: {
    getAll: vi.fn(),
    getById: vi.fn(),
    incrementView: vi.fn(),
    search: vi.fn(),
  },
}));

vi.mock('@/lib/axiosClient', () => ({
  parseAxiosError: vi.fn(() => ({ statusCode: 400, message: 'Không thể cập nhật lượt xem.' })),
  default: {},
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';

const movies = [{ id: 1, title: 'Dune' }];

const paginated = (result: unknown, pagination?: Record<string, number>) => ({
  success: true,
  statusCode: 200,
  message: 'OK',
  result,
  ...(pagination ? { pagination } : {}),
});

let queryClient: QueryClient;

const createWrapper = () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(movieApi.getAll).mockReset();
  vi.mocked(movieApi.search).mockReset();
  vi.mocked(movieApi.getById).mockReset();
  vi.mocked(movieApi.incrementView).mockReset();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  queryClient.clear();
});

describe('useGetMovies', () => {
  it('map result + pagination của envelope thành MovieListResult', async () => {
    vi.mocked(movieApi.getAll).mockResolvedValue(
      paginated(movies, { total: 42, page: 2, limit: 20, totalPages: 3 }) as any,
    );

    const { result } = renderHook(() => useGetMovies({ page: 2, limit: 20 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(movieApi.getAll).toHaveBeenCalledWith({ page: 2, limit: 20 });
    expect(result.current.data).toEqual({
      movies,
      total: 42,
      page: 2,
      limit: 20,
      totalPages: 3,
    });
  });

  it('fallback pagination từ params khi backend không trả pagination', async () => {
    vi.mocked(movieApi.getAll).mockResolvedValue(paginated(movies) as any);

    const { result } = renderHook(() => useGetMovies({ page: 3, limit: 12 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toMatchObject({
      total: 0,
      page: 3,
      limit: 12,
      totalPages: 1,
    });
  });

  it('đưa lỗi vào state khi API thất bại', async () => {
    vi.mocked(movieApi.getAll).mockRejectedValue(new Error('500'));

    const { result } = renderHook(() => useGetMovies(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('500');
  });
});

describe('useSearchMovies / useLatestMovies', () => {
  it('useSearchMovies truyền params xuống movieApi.search', async () => {
    vi.mocked(movieApi.search).mockResolvedValue(
      paginated(movies, { total: 1, page: 1, limit: 10, totalPages: 1 }) as any,
    );

    const { result } = renderHook(
      () => useSearchMovies({ page: 1, limit: 10, keyword: 'dune' }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(movieApi.search).toHaveBeenCalledWith({ page: 1, limit: 10, keyword: 'dune' });
    expect(result.current.data?.movies).toEqual(movies);
  });

  it('useLatestMovies luôn sort releaseDate:DESC', async () => {
    vi.mocked(movieApi.search).mockResolvedValue(
      paginated(movies, { total: 1, page: 1, limit: 5, totalPages: 1 }) as any,
    );

    const { result } = renderHook(() => useLatestMovies({ page: 1, limit: 5 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(movieApi.search).toHaveBeenCalledWith({ page: 1, limit: 5, sort: 'releaseDate:DESC' });
  });
});

describe('useGetMovieDetail', () => {
  it('trả chi tiết phim khi có id', async () => {
    vi.mocked(movieApi.getById).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'OK',
      result: { id: 1, title: 'Dune', moviePeoples: [] },
    } as any);

    const { result } = renderHook(() => useGetMovieDetail(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(movieApi.getById).toHaveBeenCalledWith(1);
    expect(result.current.data).toMatchObject({ id: 1, title: 'Dune' });
  });

  it('không gọi API khi id = 0', () => {
    const { result } = renderHook(() => useGetMovieDetail(0), { wrapper: createWrapper() });

    expect(movieApi.getById).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });
});

describe('useIncrementView', () => {
  it('cập nhật viewCount vào cache chi tiết phim (không refetch)', async () => {
    queryClient.setQueryData(['movie', 1], { id: 1, title: 'Dune', viewCount: 100 });
    vi.mocked(movieApi.incrementView).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'OK',
      result: { viewCount: 101, score: 5, interaction: 'updated' },
    } as any);

    const { result } = renderHook(() => useIncrementView(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(queryClient.getQueryData(['movie', 1])).toMatchObject({ viewCount: 101 });
    expect(movieApi.incrementView).toHaveBeenCalledWith(1);
  });

  it('toast lỗi khi tăng lượt xem thất bại', async () => {
    vi.mocked(movieApi.incrementView).mockRejectedValue(new Error('fail'));

    const { result } = renderHook(() => useIncrementView(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync(1)).rejects.toThrow('fail');
    });

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Không thể cập nhật lượt xem.'));
  });
});
