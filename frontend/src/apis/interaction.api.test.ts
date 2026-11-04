import { beforeEach, describe, expect, it, vi } from 'vitest';
import { interactionApi } from './interaction.api';

const mocks = vi.hoisted(() => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('@/lib/axiosClient', () => ({
  __esModule: true,
  default: mocks.client,
  parseAxiosError: vi.fn(),
}));

const envelope = (result: unknown) => ({ data: { success: true, statusCode: 200, message: 'OK', result } });

describe('interactionApi', () => {
  beforeEach(() => {
    Object.values(mocks.client).forEach((fn) => fn.mockReset());
  });

  it('toggleLike POST /interactions với body { type, movieId }', async () => {
    mocks.client.post.mockResolvedValue(
      envelope({ action: 'added', type: 'like', likeCount: 3 }),
    );

    const result = await interactionApi.toggleLike({ movieId: 7, type: 'like' });

    expect(mocks.client.post).toHaveBeenCalledWith('/interactions', {
      movieId: 7,
      type: 'like',
    });
    expect(result.result.action).toBe('added');
  });

  it('getStats gọi GET /interactions/stats/:movieId', async () => {
    mocks.client.get.mockResolvedValue(envelope({ likeCount: 1 }));

    await interactionApi.getStats('7');

    expect(mocks.client.get).toHaveBeenCalledWith('/interactions/stats/7');
  });

  it('getMyHistory gọi GET /interactions/my-history với params phân trang', async () => {
    mocks.client.get.mockResolvedValue(envelope([]));

    await interactionApi.getMyHistory({ page: 2, limit: 12 });

    expect(mocks.client.get).toHaveBeenCalledWith('/interactions/my-history', {
      params: { page: 2, limit: 12 },
    });
  });

  it('getMyFavorites gọi GET /interactions/my-favorites', async () => {
    mocks.client.get.mockResolvedValue(envelope([]));

    await interactionApi.getMyFavorites({ page: 1, limit: 100 });

    expect(mocks.client.get).toHaveBeenCalledWith('/interactions/my-favorites', {
      params: { page: 1, limit: 100 },
    });
  });

  it('getInteractionsWithMovie gọi GET /interactions/movie/:id/me', async () => {
    mocks.client.get.mockResolvedValue(envelope({ isLiked: true }));

    await interactionApi.getInteractionsWithMovie(7);

    expect(mocks.client.get).toHaveBeenCalledWith('/interactions/movie/7/me');
  });

  it('getAll gọi GET /interactions với params', async () => {
    mocks.client.get.mockResolvedValue(envelope([]));

    await interactionApi.getAll({ page: 1, limit: 20 });

    expect(mocks.client.get).toHaveBeenCalledWith('/interactions', {
      params: { page: 1, limit: 20 },
    });
  });

  it('remove gọi DELETE /interactions/:id', async () => {
    mocks.client.delete.mockResolvedValue(envelope(null));

    await interactionApi.remove('abc');

    expect(mocks.client.delete).toHaveBeenCalledWith('/interactions/abc');
  });
});
