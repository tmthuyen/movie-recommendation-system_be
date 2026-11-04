import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countryApi } from '@/apis/country.api';
import { genreApi } from '@/apis/genre.api';
import { useCreateGenre, useGetAll } from './useGenre';
import { useGetCountries } from './useCountry';

vi.mock('@/apis/genre.api', () => ({
  genreApi: {
    getAll: vi.fn(),
    create: vi.fn(),
  },
}));

vi.mock('@/apis/country.api', () => ({
  countryApi: {
    getAll: vi.fn(),
  },
}));

vi.mock('@/lib/axiosClient', () => ({
  parseAxiosError: vi.fn(() => ({ statusCode: 400, message: 'Tên thể loại đã tồn tại' })),
  default: {},
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';

let queryClient: QueryClient;

const createWrapper = () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

beforeEach(() => {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(genreApi.getAll).mockReset();
  vi.mocked(genreApi.create).mockReset();
  vi.mocked(countryApi.getAll).mockReset();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  queryClient.clear();
});

describe('useGenre', () => {
  it('useGetAll trả result và truyền params', async () => {
    vi.mocked(genreApi.getAll).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'OK',
      result: [{ id: 'g1', name: 'Hành động' }],
      pagination: { total: 1, page: 1, limit: 100, totalPages: 1 },
    } as any);

    const { result } = renderHook(() => useGetAll({ limit: 100 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(genreApi.getAll).toHaveBeenCalledWith({ limit: 100 });
    expect(result.current.data).toEqual([{ id: 'g1', name: 'Hành động' }]);
  });

  it('useCreateGenre invalidate cache genres khi thành công', async () => {
    vi.mocked(genreApi.create).mockResolvedValue({
      success: true,
      statusCode: 201,
      message: 'OK',
      result: { id: 'g2', name: 'Kinh dị' },
    } as any);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreateGenre(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ name: 'Kinh dị' });
    });

    expect(genreApi.create).toHaveBeenCalledWith({ name: 'Kinh dị' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['genres'] });
  });

  it('useCreateGenre lỗi → toast tiếng Việt', async () => {
    vi.mocked(genreApi.create).mockRejectedValue(new Error('409'));

    const { result } = renderHook(() => useCreateGenre(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'Trùng' })).rejects.toThrow('409');
    });

    expect(toast.error).toHaveBeenCalledWith('Lỗi: Tên thể loại đã tồn tại');
  });
});

describe('useCountry', () => {
  it('useGetCountries luôn lấy limit 500 cho dropdown lọc', async () => {
    vi.mocked(countryApi.getAll).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'OK',
      result: [{ id: 1, viName: 'Việt Nam' }],
      pagination: { total: 1, page: 1, limit: 500, totalPages: 1 },
    } as any);

    const { result } = renderHook(() => useGetCountries(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(countryApi.getAll).toHaveBeenCalledWith({ page: 1, limit: 500 });
    expect(result.current.data).toEqual([{ id: 1, viName: 'Việt Nam' }]);
  });
});
