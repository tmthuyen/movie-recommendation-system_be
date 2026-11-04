import { beforeEach, describe, expect, it, vi } from 'vitest';
import { movieApi } from './movie.api';

const mocks = vi.hoisted(() => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/axiosClient', () => ({
  __esModule: true,
  default: mocks.client,
  parseAxiosError: vi.fn(),
}));

const envelope = (result: unknown) => ({ data: { success: true, statusCode: 200, message: 'OK', result } });

describe('movieApi', () => {
  beforeEach(() => {
    Object.values(mocks.client).forEach((fn) => fn.mockReset());
  });

  it('getAll gọi GET /movies với params', async () => {
    mocks.client.get.mockResolvedValue(envelope([{ id: 1 }]));

    const result = await movieApi.getAll({ page: 2, limit: 10, keyword: 'dune' });

    expect(mocks.client.get).toHaveBeenCalledWith('/movies', {
      params: { page: 2, limit: 10, keyword: 'dune' },
    });
    expect(result.result).toEqual([{ id: 1 }]);
  });

  it('getById gọi GET /movies/:id', async () => {
    mocks.client.get.mockResolvedValue(envelope({ id: 5, title: 'Dune' }));

    const result = await movieApi.getById(5);

    expect(mocks.client.get).toHaveBeenCalledWith('/movies/5');
    expect(result.result).toMatchObject({ id: 5 });
  });

  it('incrementView gọi POST /movies/:id/view', async () => {
    mocks.client.post.mockResolvedValue(
      envelope({ viewCount: 11, score: 1, interaction: 'created' }),
    );

    const result = await movieApi.incrementView(5);

    expect(mocks.client.post).toHaveBeenCalledWith('/movies/5/view');
    expect(result.result.viewCount).toBe(11);
  });

  it('create gọi POST /movies với payload', async () => {
    mocks.client.post.mockResolvedValue(envelope({ id: 9 }));

    await movieApi.create({ title: 'Dune' });

    expect(mocks.client.post).toHaveBeenCalledWith('/movies', { title: 'Dune' });
  });

  it('update gọi PATCH /movies/:id', async () => {
    mocks.client.patch.mockResolvedValue(envelope({ id: 9 }));

    await movieApi.update(9, { title: 'Dune 2' });

    expect(mocks.client.patch).toHaveBeenCalledWith('/movies/9', { title: 'Dune 2' });
  });

  it('remove gọi DELETE /movies/:id', async () => {
    mocks.client.delete.mockResolvedValue(envelope(null));

    const result = await movieApi.remove(9);

    expect(mocks.client.delete).toHaveBeenCalledWith('/movies/9');
    expect(result.result).toBeNull();
  });

  it('search gọi GET /movies/search với params', async () => {
    mocks.client.get.mockResolvedValue(envelope([{ id: 1 }]));

    await movieApi.search({ page: 1, limit: 10, sort: 'releaseDate:DESC' });

    expect(mocks.client.get).toHaveBeenCalledWith('/movies/search', {
      params: { page: 1, limit: 10, sort: 'releaseDate:DESC' },
    });
  });

  it('lan truyền lỗi axios cho caller', async () => {
    const error = new Error('500');
    mocks.client.get.mockRejectedValue(error);

    await expect(movieApi.getAll()).rejects.toBe(error);
  });
});
