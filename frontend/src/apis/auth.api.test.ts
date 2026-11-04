import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from './auth.api';

const mocks = vi.hoisted(() => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

vi.mock('@/lib/axiosClient', () => ({
  __esModule: true,
  default: mocks.client,
  parseAxiosError: vi.fn(),
}));

const envelope = (result: unknown) => ({ data: { success: true, statusCode: 200, message: 'OK', result } });

describe('authApi', () => {
  beforeEach(() => {
    Object.values(mocks.client).forEach((fn) => fn.mockReset());
  });

  it('login POST /auth/login với username/password', async () => {
    mocks.client.post.mockResolvedValue(envelope({ accessToken: 'a', refreshToken: 'r' }));

    const result = await authApi.login({ username: 'an', password: '123' });

    expect(mocks.client.post).toHaveBeenCalledWith('/auth/login', {
      username: 'an',
      password: '123',
    });
    expect(result.result.accessToken).toBe('a');
  });

  it('register POST /auth/register với toàn bộ payload', async () => {
    mocks.client.post.mockResolvedValue(envelope({ accessToken: 'a', refreshToken: 'r' }));
    const payload = {
      fullName: 'An',
      email: 'an@example.com',
      password: '123456',
      confirmPassword: '123456',
    };

    await authApi.register(payload);

    expect(mocks.client.post).toHaveBeenCalledWith('/auth/register', payload);
  });

  it('loginGoogle POST /auth/login-google', async () => {
    mocks.client.post.mockResolvedValue(envelope({ accessToken: 'a', refreshToken: 'r' }));

    await authApi.loginGoogle({ idToken: 'id-token' });

    expect(mocks.client.post).toHaveBeenCalledWith('/auth/login-google', { idToken: 'id-token' });
  });

  it('refresh POST /auth/refresh kèm withCredentials', async () => {
    mocks.client.post.mockResolvedValue(envelope({ accessToken: 'new', refreshToken: 'r' }));

    const result = await authApi.refresh();

    expect(mocks.client.post).toHaveBeenCalledWith('/auth/refresh', null, { withCredentials: true });
    expect(result.result.accessToken).toBe('new');
  });

  it('getMe GET /auth/me', async () => {
    mocks.client.get.mockResolvedValue(envelope({ id: 'u1' }));

    const result = await authApi.getMe();

    expect(mocks.client.get).toHaveBeenCalledWith('/auth/me');
    expect(result.result).toEqual({ id: 'u1' });
  });

  it('sendVerificationEmail POST /auth/send-verification-email', async () => {
    mocks.client.post.mockResolvedValue(envelope({ sent: true }));

    await authApi.sendVerificationEmail();

    expect(mocks.client.post).toHaveBeenCalledWith('/auth/send-verification-email');
  });

  it('verifyEmail POST /auth/verify-email với token', async () => {
    mocks.client.post.mockResolvedValue(envelope({ verified: true }));

    await authApi.verifyEmail('token-123');

    expect(mocks.client.post).toHaveBeenCalledWith('/auth/verify-email', { token: 'token-123' });
  });

  it('getSessions GET /auth/sessions', async () => {
    mocks.client.get.mockResolvedValue(envelope([{ id: 's1' }]));

    const result = await authApi.getSessions();

    expect(mocks.client.get).toHaveBeenCalledWith('/auth/sessions');
    expect(result.result).toHaveLength(1);
  });

  it('logout và logoutAll gọi đúng endpoint', async () => {
    mocks.client.post.mockResolvedValue({});

    await authApi.logout();
    await authApi.logoutAll();

    expect(mocks.client.post).toHaveBeenNthCalledWith(1, '/auth/logout');
    expect(mocks.client.post).toHaveBeenNthCalledWith(2, '/auth/logout-all');
  });

  it('logoutBySession nội suy sessionId vào path', async () => {
    mocks.client.post.mockResolvedValue({});

    await authApi.logoutBySession({ sessionId: 's-9' });

    expect(mocks.client.post).toHaveBeenCalledWith('/auth/logout-session/s-9');
  });

  it('updatePassword PATCH /auth/change-password', async () => {
    mocks.client.patch.mockResolvedValue(envelope(null));
    const payload = {
      oldPassword: 'old',
      newPassword: 'new',
      confirmPassword: 'new',
    };

    await authApi.updatePassword(payload);

    expect(mocks.client.patch).toHaveBeenCalledWith('/auth/change-password', payload);
  });

  it('lan truyền lỗi axios cho caller', async () => {
    const error = new Error('401');
    mocks.client.post.mockRejectedValue(error);

    await expect(authApi.login({ username: 'a', password: 'b' })).rejects.toBe(error);
  });
});
