import { beforeEach, describe, expect, it, vi } from 'vitest';
import { userApi } from './user.api';

const mocks = vi.hoisted(() => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/axiosClient', () => ({
  __esModule: true,
  default: mocks.client,
  parseAxiosError: vi.fn(),
}));

const envelope = (result: unknown) => ({ data: { success: true, statusCode: 200, message: 'OK', result } });

describe('userApi', () => {
  beforeEach(() => {
    Object.values(mocks.client).forEach((fn) => fn.mockReset());
  });

  it('getAllUsers GET /users với params phân trang', async () => {
    mocks.client.get.mockResolvedValue(envelope([{ id: 'u1' }]));

    const result = await userApi.getAllUsers({ page: 2, limit: 10, keyword: 'an' });

    expect(mocks.client.get).toHaveBeenCalledWith('/users', {
      params: { page: 2, limit: 10, keyword: 'an' },
    });
    expect(result.result).toHaveLength(1);
  });

  it('getUserById GET /users/:id', async () => {
    mocks.client.get.mockResolvedValue(envelope({ id: 'u1' }));

    await userApi.getUserById(1);

    expect(mocks.client.get).toHaveBeenCalledWith('/users/1');
  });

  it('createUser POST /users', async () => {
    mocks.client.post.mockResolvedValue(envelope({ id: 'u2' }));

    const result = await userApi.createUser({ name: 'An' });

    expect(mocks.client.post).toHaveBeenCalledWith('/users', { name: 'An' });
    expect(result.result).toEqual({ id: 'u2' });
  });

  it('updateUserAdmin PUT /users/:id', async () => {
    mocks.client.put.mockResolvedValue(envelope({ id: 'u1' }));

    await userApi.updateUserAdmin('1', { fullName: 'An' });

    expect(mocks.client.put).toHaveBeenCalledWith('/users/1', { fullName: 'An' });
  });

  it('updateUserRoles PATCH /users/:id/roles với roleIds', async () => {
    mocks.client.patch.mockResolvedValue(envelope({ id: 'u1' }));

    await userApi.updateUserRoles(1, ['r1', 'r2']);

    expect(mocks.client.patch).toHaveBeenCalledWith('/users/1/roles', { roleIds: ['r1', 'r2'] });
  });

  it('deleteUser DELETE /users/:id', async () => {
    mocks.client.delete.mockResolvedValue(envelope(null));

    await userApi.deleteUser(1);

    expect(mocks.client.delete).toHaveBeenCalledWith('/users/1');
  });

  it('updateProfile PUT /users/me và trả result', async () => {
    mocks.client.put.mockResolvedValue(envelope({ id: 'u1', fullName: 'An' }));

    const result = await userApi.updateProfile({ fullName: 'An' });

    expect(mocks.client.put).toHaveBeenCalledWith('/users/me', { fullName: 'An' });
    expect(result.result.fullName).toBe('An');
  });

  it('uploadAvatar gửi multipart/form-data tới /users/me/avatar', async () => {
    const formData = new FormData();
    mocks.client.post.mockResolvedValue({ data: { url: '/a.png' } });

    await userApi.uploadAvatar(formData);

    expect(mocks.client.post).toHaveBeenCalledWith('/users/me/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  });

  it('updateUserAvatar gửi multipart/form-data tới /users/avatar và trả envelope', async () => {
    const formData = new FormData();
    mocks.client.post.mockResolvedValue(envelope('https://cdn/a.png'));

    const result = await userApi.updateUserAvatar(formData);

    expect(mocks.client.post).toHaveBeenCalledWith('/users/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    expect(result.result).toBe('https://cdn/a.png');
  });

  it('getSessions trả thẳng response của axios (không bóc data)', async () => {
    const response = { data: { result: [] } };
    mocks.client.get.mockResolvedValue(response);

    await expect(userApi.getSessions()).resolves.toBe(response);
  });
});
