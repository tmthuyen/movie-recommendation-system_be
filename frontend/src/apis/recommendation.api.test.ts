import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recommendationApi } from './recommendation.api';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock('@/lib/axiosClient', () => ({
  __esModule: true,
  default: { get: mocks.get, post: vi.fn(), delete: vi.fn() },
  parseAxiosError: vi.fn(),
}));

describe('recommendationApi', () => {
  beforeEach(() => {
    mocks.get.mockReset();
  });

  it('getSimilarMovies gọi đúng path + params và trả data của axios', async () => {
    const payload = {
      success: true,
      statusCode: 200,
      message: 'OK',
      result: [{ id: 2, title: 'Dune 2', similarScore: 0.9 }],
    };
    mocks.get.mockResolvedValue({ data: payload });

    const result = await recommendationApi.getSimilarMovies('7', { topK: 3 });

    expect(mocks.get).toHaveBeenCalledWith('/recommendations/similar/7', {
      params: { topK: 3 },
    });
    expect(result).toBe(payload);
  });

  it('getSimilarMovies không params vẫn truyền params undefined', async () => {
    mocks.get.mockResolvedValue({ data: { result: [] } });

    await recommendationApi.getSimilarMovies('12');

    expect(mocks.get).toHaveBeenCalledWith('/recommendations/similar/12', { params: undefined });
  });

  it('getSimilarMoviesCursor gọi đúng path + params cursor/limit', async () => {
    const payload = {
      success: true,
      statusCode: 200,
      message: 'OK',
      result: [{ id: 2, title: 'Dune 2', similarityScore: 0.9 }],
      pagination: {
        limit: 12,
        total: 20,
        hasMore: true,
        nextCursor: 'next-cursor',
      },
    };
    mocks.get.mockResolvedValue({ data: payload });

    const result = await recommendationApi.getSimilarMoviesCursor('7', {
      cursor: 'current-cursor',
      limit: 12,
    });

    expect(mocks.get).toHaveBeenCalledWith('/recommendations/similar/7/cursor', {
      params: { cursor: 'current-cursor', limit: 12 },
    });
    expect(result).toBe(payload);
  });

  it('semanticSearch gửi query + topK', async () => {
    mocks.get.mockResolvedValue({ data: { result: [] } });

    await recommendationApi.semanticSearch({ query: 'phim vũ trụ', topK: 5 });

    expect(mocks.get).toHaveBeenCalledWith('/recommendations/semantic-search', {
      params: { query: 'phim vũ trụ', topK: 5 },
    });
  });

  it('hybridSearch gửi đầy đủ tham số phân trang', async () => {
    mocks.get.mockResolvedValue({ data: { result: [] } });

    await recommendationApi.hybridSearch({
      userId: 'u1',
      keyword: 'dune',
      topK: 10,
      page: 2,
      pageSize: 20,
    });

    expect(mocks.get).toHaveBeenCalledWith('/recommendations/hybrid-search', {
      params: { userId: 'u1', keyword: 'dune', topK: 10, page: 2, pageSize: 20 },
    });
  });

  it('lan truyền lỗi từ axiosClient cho caller xử lý', async () => {
    const error = new Error('network');
    mocks.get.mockRejectedValue(error);

    await expect(recommendationApi.getSimilarMovies('1')).rejects.toBe(error);
  });
});
