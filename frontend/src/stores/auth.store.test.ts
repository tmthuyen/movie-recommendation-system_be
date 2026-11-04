import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '@/apis/auth.api';
import { User } from '@/shared/types/api.types';
import { useAuthStore } from './auth.store';

vi.mock('@/apis/auth.api', () => ({
  authApi: {
    refresh: vi.fn(),
    getMe: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import { toast } from 'sonner';

const userFixture: User = {
  id: 'u1',
  email: 'an@example.com',
  fullName: 'Nguyễn An',
  status: 'ACTIVE',
  isVerified: true,
  roles: [
    {
      id: 'r1',
      name: 'User',
      code: 'USER',
      createdAt: new Date('2024-01-01'),
      createdBy: 'system',
      updatedAt: new Date('2024-01-01'),
      updatedBy: 'system',
    },
  ],
  createdAt: new Date('2024-01-01'),
  createdBy: 'system',
  updatedAt: new Date('2024-01-01'),
  updatedBy: 'system',
};

const refreshOk = {
  success: true,
  statusCode: 200,
  message: 'OK',
  result: { accessToken: 'access-token', refreshToken: 'refresh-token' },
};

const meOk = { success: true, statusCode: 200, message: 'OK', result: userFixture };

const resetStore = () =>
  useAuthStore.setState({
    accessToken: null,
    user: null,
    isLoading: true,
    isAuthenticated: false,
  });

describe('auth.store bootstrap', () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(authApi.refresh).mockReset();
    vi.mocked(authApi.getMe).mockReset();
    vi.mocked(authApi.logout).mockReset();
    vi.mocked(toast.error).mockClear();
  });

  it('refresh + getMe thành công → lưu token, user và đánh dấu đã đăng nhập', async () => {
    vi.mocked(authApi.refresh).mockResolvedValue(refreshOk);
    vi.mocked(authApi.getMe).mockResolvedValue(meOk);

    const user = await useAuthStore.getState().bootstrap();

    expect(user).toEqual(userFixture);
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: 'access-token',
      user: userFixture,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  it('gọi bootstrap song song chỉ thực hiện 1 lần (single-flight)', async () => {
    vi.mocked(authApi.refresh).mockResolvedValue(refreshOk);
    vi.mocked(authApi.getMe).mockResolvedValue(meOk);

    const first = useAuthStore.getState().bootstrap();
    const second = useAuthStore.getState().bootstrap();

    expect(first).toBe(second);
    await Promise.all([first, second]);

    expect(authApi.refresh).toHaveBeenCalledTimes(1);
    expect(authApi.getMe).toHaveBeenCalledTimes(1);
  });

  it('refresh trả success=false → clear user, báo lỗi phiên hết hạn', async () => {
    vi.mocked(authApi.refresh).mockResolvedValue({
      ...refreshOk,
      success: false,
    });

    const user = await useAuthStore.getState().bootstrap();

    expect(user).toBeNull();
    expect(authApi.getMe).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('refresh không trả accessToken → coi như thất bại, không gọi getMe', async () => {
    vi.mocked(authApi.refresh).mockResolvedValue({
      ...refreshOk,
      result: { accessToken: '', refreshToken: '' },
    });

    await expect(useAuthStore.getState().bootstrap()).resolves.toBeNull();
    expect(authApi.getMe).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('getMe trả result rỗng → không đăng nhập, báo lỗi', async () => {
    vi.mocked(authApi.refresh).mockResolvedValue(refreshOk);
    vi.mocked(authApi.getMe).mockResolvedValue({
      ...meOk,
      result: undefined as unknown as User,
    });

    await expect(useAuthStore.getState().bootstrap()).resolves.toBeNull();
    expect(toast.error).toHaveBeenCalledWith(
      'Không thể lấy thông tin người dùng. Vui lòng đăng nhập lại.',
    );
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });

  it('refresh ném lỗi mạng → nuốt lỗi, trả null và tắt loading', async () => {
    vi.mocked(authApi.refresh).mockRejectedValue(new Error('network'));

    await expect(useAuthStore.getState().bootstrap()).resolves.toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isLoading: false });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('có thể bootstrap lại sau lần thất bại (không dính cache promise)', async () => {
    vi.mocked(authApi.refresh).mockRejectedValueOnce(new Error('network'));
    await useAuthStore.getState().bootstrap();

    vi.mocked(authApi.refresh).mockResolvedValue(refreshOk);
    vi.mocked(authApi.getMe).mockResolvedValue(meOk);

    const user = await useAuthStore.getState().bootstrap();

    expect(user).toEqual(userFixture);
    expect(authApi.refresh).toHaveBeenCalledTimes(2);
  });
});

describe('auth.store refreshUser', () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(authApi.refresh).mockReset();
    vi.mocked(authApi.getMe).mockReset();
    vi.mocked(toast.error).mockClear();
  });

  it('cập nhật user và isAuthenticated khi gọi thành công', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue(meOk);

    await expect(useAuthStore.getState().refreshUser()).resolves.toEqual(userFixture);
    expect(useAuthStore.getState()).toMatchObject({ user: userFixture, isAuthenticated: true });
  });

  it('getMe lỗi → xoá phiên đăng nhập, trả null', async () => {
    useAuthStore.setState({ user: userFixture, isAuthenticated: true });
    vi.mocked(authApi.getMe).mockRejectedValue(new Error('401'));

    await expect(useAuthStore.getState().refreshUser()).resolves.toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });

  it('getMe trả result rỗng → báo lỗi và xoá phiên', async () => {
    vi.mocked(authApi.getMe).mockResolvedValue({ ...meOk, result: undefined as unknown as User });

    await expect(useAuthStore.getState().refreshUser()).resolves.toBeNull();
    expect(toast.error).toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({ user: null, isAuthenticated: false });
  });
});

describe('auth.store logout / clearAuth', () => {
  beforeEach(() => {
    resetStore();
    vi.mocked(authApi.logout).mockReset();
  });

  it('logout gọi API rồi xoá toàn bộ state', async () => {
    useAuthStore.setState({ accessToken: 'token', user: userFixture, isAuthenticated: true });
    vi.mocked(authApi.logout).mockResolvedValue(undefined);

    await useAuthStore.getState().logout();

    expect(authApi.logout).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });

  it('logout vẫn reject khi API lỗi (caller tự xử lý)', async () => {
    useAuthStore.setState({ accessToken: 'token', user: userFixture, isAuthenticated: true });
    vi.mocked(authApi.logout).mockRejectedValue(new Error('network'));

    await expect(useAuthStore.getState().logout()).rejects.toThrow('network');
    expect(useAuthStore.getState().accessToken).toBe('token');
  });

  it('clearAuth xoá state mà không gọi API', () => {
    useAuthStore.setState({ accessToken: 'token', user: userFixture, isAuthenticated: true });
    vi.mocked(authApi.logout).mockClear();

    useAuthStore.getState().clearAuth();

    expect(authApi.logout).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });
  });
});

describe('auth.store setters', () => {
  beforeEach(resetStore);

  it('setAccessToken cập nhật token', () => {
    useAuthStore.getState().setAccessToken('abc');
    expect(useAuthStore.getState().accessToken).toBe('abc');

    useAuthStore.getState().setAccessToken(null);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('setUser cập nhật user', () => {
    useAuthStore.getState().setUser(userFixture);
    expect(useAuthStore.getState().user).toEqual(userFixture);
  });
});
