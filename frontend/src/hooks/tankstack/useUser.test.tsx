import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userApi } from '@/apis/user.api';
import useUser, { useCreate, useGetAll, useGetOne } from './useUser';

const { useUpdate, useDelete, useUpdateMe, useUpdateAvatar } = useUser;

vi.mock('@/apis/user.api', () => ({
  userApi: {
    getAllUsers: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    updateUserAdmin: vi.fn(),
    deleteUser: vi.fn(),
    updateProfile: vi.fn(),
    updateUserAvatar: vi.fn(),
  },
}));

vi.mock('@/lib/axiosClient', () => ({
  parseAxiosError: vi.fn(() => ({ statusCode: 400, message: 'Dữ liệu không hợp lệ' })),
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
  vi.mocked(userApi.getAllUsers).mockReset();
  vi.mocked(userApi.getUserById).mockReset();
  vi.mocked(userApi.createUser).mockReset();
  vi.mocked(userApi.updateUserAdmin).mockReset();
  vi.mocked(userApi.deleteUser).mockReset();
  vi.mocked(userApi.updateProfile).mockReset();
  vi.mocked(userApi.updateUserAvatar).mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

afterEach(() => {
  queryClient.clear();
});

describe('useUser.useGetAll / useGetOne', () => {
  it('trả result của envelope danh sách user', async () => {
    vi.mocked(userApi.getAllUsers).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'OK',
      result: [{ id: 'u1', fullName: 'An' }],
      pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
    } as any);

    const { result } = renderHook(() => useGetAll(undefined, undefined, 2, 20), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(userApi.getAllUsers).toHaveBeenCalledWith({ page: 2, limit: 20 });
    expect(result.current.data).toEqual([{ id: 'u1', fullName: 'An' }]);
  });

  it('useGetOne trả chi tiết user', async () => {
    vi.mocked(userApi.getUserById).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'OK',
      result: { id: 'u1', fullName: 'An' },
    } as any);

    const { result } = renderHook(() => useGetOne(1), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(userApi.getUserById).toHaveBeenCalledWith(1);
    expect(result.current.data).toMatchObject({ id: 'u1' });
  });
});

describe('useUser mutations', () => {
  it('useCreate invalidate danh sách và toast message từ server', async () => {
    vi.mocked(userApi.createUser).mockResolvedValue({
      success: true,
      statusCode: 201,
      message: 'Tạo người dùng thành công!',
      result: { id: 'u1' },
    } as any);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCreate(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ name: 'An' });
    });

    expect(userApi.createUser).toHaveBeenCalledWith({ name: 'An' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['users'] });
    expect(toast.success).toHaveBeenCalledWith('Tạo người dùng thành công!');
  });

  it('useCreate lỗi → toast "Lỗi: ..." từ parseAxiosError', async () => {
    vi.mocked(userApi.createUser).mockRejectedValue(new Error('400'));

    const { result } = renderHook(() => useCreate(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.mutateAsync({ name: 'An' })).rejects.toThrow('400');
    });

    expect(toast.error).toHaveBeenCalledWith('Lỗi: Dữ liệu không hợp lệ');
  });

  it('useUpdate gọi updateUserAdmin với id + data', async () => {
    vi.mocked(userApi.updateUserAdmin).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'Cập nhật thành công!',
      result: { id: 'u1' },
    } as any);

    const { result } = renderHook(() => useUpdate(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ id: 1, data: { fullName: 'An' } });
    });

    expect(userApi.updateUserAdmin).toHaveBeenCalledWith(1, { fullName: 'An' });
    expect(toast.success).toHaveBeenCalledWith('Cập nhật thành công!');
  });

  it('useDelete gọi deleteUser và toast message', async () => {
    vi.mocked(userApi.deleteUser).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'Xóa người dùng thành công!',
      result: null,
    } as any);

    const { result } = renderHook(() => useDelete(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(userApi.deleteUser).toHaveBeenCalledWith(1);
    expect(toast.success).toHaveBeenCalledWith('Xóa người dùng thành công!');
  });

  it('useUpdateMe gọi updateProfile', async () => {
    vi.mocked(userApi.updateProfile).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'Cập nhật thông tin người dùng thành công!',
      result: { id: 'u1' },
    } as any);

    const { result } = renderHook(() => useUpdateMe(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ fullName: 'An' });
    });

    expect(userApi.updateProfile).toHaveBeenCalledWith({ fullName: 'An' });
  });

  it('useUpdateAvatar gửi FormData', async () => {
    vi.mocked(userApi.updateUserAvatar).mockResolvedValue({
      success: true,
      statusCode: 200,
      message: 'Cập nhật avatar thành công!',
      result: 'https://cdn/a.png',
    } as any);
    const formData = new FormData();

    const { result } = renderHook(() => useUpdateAvatar(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.mutateAsync(formData);
    });

    expect(userApi.updateUserAvatar).toHaveBeenCalledWith(formData);
  });
});
