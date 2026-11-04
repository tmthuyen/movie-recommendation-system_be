import { beforeEach, describe, expect, it, vi } from 'vitest';
import { countryApi } from './country.api';
import { genreApi } from './genre.api';

const mocks = vi.hoisted(() => ({
  client: {
    get: vi.fn(),
    post: vi.fn(),
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

describe('genreApi', () => {
  beforeEach(() => {
    Object.values(mocks.client).forEach((fn) => fn.mockReset());
  });

  it('getAll GET /genres với params', async () => {
    mocks.client.get.mockResolvedValue(envelope([{ id: 'g1', name: 'Hành động' }]));

    const result = await genreApi.getAll({ page: 1, limit: 100 });

    expect(mocks.client.get).toHaveBeenCalledWith('/genres', {
      params: { page: 1, limit: 100 },
    });
    expect(result.result).toHaveLength(1);
  });

  it('getById GET /genres/:id', async () => {
    mocks.client.get.mockResolvedValue(envelope({ id: 'g1' }));

    await genreApi.getById('g1');

    expect(mocks.client.get).toHaveBeenCalledWith('/genres/g1');
  });

  it('create POST /genres', async () => {
    mocks.client.post.mockResolvedValue(envelope({ id: 'g2' }));

    await genreApi.create({ name: 'Kinh dị' });

    expect(mocks.client.post).toHaveBeenCalledWith('/genres', { name: 'Kinh dị' });
  });

  it('update dùng PATCH /genres/:id', async () => {
    mocks.client.patch.mockResolvedValue(envelope({ id: 'g1' }));

    await genreApi.update('g1', { name: 'Mới' });

    expect(mocks.client.patch).toHaveBeenCalledWith('/genres/g1', { name: 'Mới' });
  });

  it('delete gọi DELETE /genres/:id', async () => {
    mocks.client.delete.mockResolvedValue(envelope(null));

    await genreApi.delete('g1');

    expect(mocks.client.delete).toHaveBeenCalledWith('/genres/g1');
  });
});

describe('countryApi', () => {
  beforeEach(() => {
    Object.values(mocks.client).forEach((fn) => fn.mockReset());
  });

  it('getAll GET /countries với params', async () => {
    mocks.client.get.mockResolvedValue(envelope([{ id: 1, viName: 'Việt Nam' }]));

    const result = await countryApi.getAll({ page: 1, limit: 500 });

    expect(mocks.client.get).toHaveBeenCalledWith('/countries', {
      params: { page: 1, limit: 500 },
    });
    expect(result.result[0]).toMatchObject({ viName: 'Việt Nam' });
  });

  it('getById GET /countries/:id', async () => {
    mocks.client.get.mockResolvedValue(envelope({ id: 1 }));

    await countryApi.getById('1');

    expect(mocks.client.get).toHaveBeenCalledWith('/countries/1');
  });

  it('create POST /countries', async () => {
    mocks.client.post.mockResolvedValue(envelope({ id: 1 }));
    const input = { viName: 'Việt Nam', enName: 'Vietnam', code: 'VN', region: 'Asia' };

    await countryApi.create(input);

    expect(mocks.client.post).toHaveBeenCalledWith('/countries', input);
  });

  it('update dùng PATCH /countries/:id', async () => {
    mocks.client.patch.mockResolvedValue(envelope({ id: 1 }));

    await countryApi.update(1, { viName: 'Việt Nam' });

    expect(mocks.client.patch).toHaveBeenCalledWith('/countries/1', { viName: 'Việt Nam' });
  });

  it('remove gọi DELETE /countries/:id', async () => {
    mocks.client.delete.mockResolvedValue(envelope(null));

    await countryApi.remove(1);

    expect(mocks.client.delete).toHaveBeenCalledWith('/countries/1');
  });
});
