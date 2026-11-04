import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { interactionApi } from '@/apis/interaction.api';
import { useAuthStore } from '@/stores/auth.store';
import {
  interactionWithMovieQueryKey,
  useMyInteractionsWithMovie,
  useToggleInteraction,
} from './useInteraction';

vi.mock('@/apis/interaction.api', () => ({
  interactionApi: {
    toggleLike: vi.fn(),
    getStats: vi.fn(),
    getMyHistory: vi.fn(),
    getMyFavorites: vi.fn(),
    getInteractionsWithMovie: vi.fn(),
    getAll: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('@/lib/axiosClient', () => ({
  parseAxiosError: vi.fn(() => ({ statusCode: 400, message: 'Không thể cập nhật tương tác.' })),
  default: {},
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from 'sonner';

const CURRENT_USER_ID = 'user-1';

const toggleResponse = (action: 'added' | 'removed') => ({
  success: true,
  statusCode: 200,
  message: 'OK',
  result: {
    action,
    type: 'like' as const,
    likeCount: action === 'added' ? 5 : 4,
    data: {
      id: 99,
      score: 5,
      type: 'like' as const,
      movieId: 1,
      user: { id: CURRENT_USER_ID },
      createdAt: new Date(),
      createdBy: 'system',
      updatedAt: new Date(),
      updatedBy: 'system',
    },
  },
});

let queryClient: QueryClient;

const createWrapper = () => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return Wrapper;
};

const seedMyInteraction = (isLiked: boolean) =>
  queryClient.setQueryData(interactionWithMovieQueryKey(1), {
    isLiked,
    click: true,
    commentCount: 0,
    rating: null,
  });

const readMyInteraction = () => queryClient.getQueryData<any>(interactionWithMovieQueryKey(1));

describe('useToggleInteraction', () => {
  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    useAuthStore.setState({
      user: { id: CURRENT_USER_ID } as any,
      isAuthenticated: true,
    });
    vi.mocked(interactionApi.toggleLike).mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
    seedMyInteraction(false);
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('optimistic: đảo isLiked ngay khi mutate (trước khi server trả lời)', async () => {
    let resolveToggle: (value: unknown) => void = () => {};
    vi.mocked(interactionApi.toggleLike).mockReturnValue(
      new Promise((resolve) => {
        resolveToggle = resolve;
      }) as any,
    );

    const { result } = renderHook(() => useToggleInteraction(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ movieId: 1, type: 'like' });
    });

    await waitFor(() => expect(readMyInteraction()?.isLiked).toBe(true));

    await act(async () => {
      resolveToggle(toggleResponse('added'));
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('thành công: trả isLiked theo user hiện tại + toast "Đã thêm vào yêu thích."', async () => {
    vi.mocked(interactionApi.toggleLike).mockResolvedValue(toggleResponse('added') as any);

    const { result } = renderHook(() => useToggleInteraction(), {
      wrapper: createWrapper(),
    });

    const data = await act(async () => result.current.mutateAsync({ movieId: 1, type: 'like' }));

    expect(interactionApi.toggleLike).toHaveBeenCalledWith({ movieId: 1, type: 'like' });
    expect(data).toEqual({ action: 'added', type: 'like', isLiked: true, likeCount: 5 });
    expect(toast.success).toHaveBeenCalledWith('Đã thêm vào yêu thích.');
  });

  it('hành động removed → toast "Đã bỏ yêu thích."', async () => {
    vi.mocked(interactionApi.toggleLike).mockResolvedValue(toggleResponse('removed') as any);

    const { result } = renderHook(() => useToggleInteraction(), {
      wrapper: createWrapper(),
    });

    const data = await act(async () => result.current.mutateAsync({ movieId: 1, type: 'like' }));

    expect(data).toMatchObject({ action: 'removed', likeCount: 4 });
    expect(toast.success).toHaveBeenCalledWith('Đã bỏ yêu thích.');
  });

  it('lỗi: rollback cache về trạng thái trước đó và toast lỗi', async () => {
    vi.mocked(interactionApi.toggleLike).mockRejectedValue(new Error('server error'));

    const { result } = renderHook(() => useToggleInteraction(), {
      wrapper: createWrapper(),
    });

    act(() => {
      result.current.mutate({ movieId: 1, type: 'like' });
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(readMyInteraction()?.isLiked).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('Không thể cập nhật tương tác.');
  });

  it('onSettled invalidate danh sách lịch sử và yêu thích', async () => {
    vi.mocked(interactionApi.toggleLike).mockResolvedValue(toggleResponse('added') as any);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useToggleInteraction(), {
      wrapper: createWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ movieId: 1, type: 'like' });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-history'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['my-favorites-page'] });
  });
});

describe('useMyInteractionsWithMovie', () => {
  beforeEach(() => {
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(interactionApi.getInteractionsWithMovie).mockReset();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('fetch và trả result khi đã đăng nhập', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: CURRENT_USER_ID } as any });
    vi.mocked(interactionApi.getInteractionsWithMovie).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'OK',
      result: { isLiked: true, click: true, commentCount: 2, rating: null },
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    } as any);

    const { result } = renderHook(() => useMyInteractionsWithMovie(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(interactionApi.getInteractionsWithMovie).toHaveBeenCalledWith(1);
    expect(result.current.data).toEqual({
      isLiked: true,
      click: true,
      commentCount: 2,
      rating: null,
    });
  });

  it('không gọi API khi chưa đăng nhập', () => {
    useAuthStore.setState({ isAuthenticated: false, user: null });

    const { result } = renderHook(() => useMyInteractionsWithMovie(1), {
      wrapper: createWrapper(),
    });

    expect(interactionApi.getInteractionsWithMovie).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe('idle');
  });

  it('giữ lỗi trong state khi API thất bại', async () => {
    useAuthStore.setState({ isAuthenticated: true, user: { id: CURRENT_USER_ID } as any });
    vi.mocked(interactionApi.getInteractionsWithMovie).mockRejectedValue(new Error('401'));

    const { result } = renderHook(() => useMyInteractionsWithMovie(1), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(Error);
  });
});
