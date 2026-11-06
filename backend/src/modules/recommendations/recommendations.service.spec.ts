import { AppException } from '@/common/custom-exception/app-exception';
import { HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RecommendationsService } from './recommendations.service';
import { MoviesService } from '@/modules/movies/movies.service';
import { FakeCacheService } from '@/infrastructure/cache/testing/fake-cache.service';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let cache: FakeCacheService;
  let movieService: { findOne: jest.Mock; findByIds: jest.Mock };

  const buildAiResponse = (overrides: Record<string, unknown> = {}) => ({
    success: true,
    statusCode: 200,
    message: 'ok',
    result: [
      { id: 1, title: 'Phim A', similarityScore: 0.92, rank: 1 },
      { id: 2, title: 'Phim B', similarityScore: 0.81 },
    ],
    pagination: {
      total: 2,
      totalPages: 1,
      page: 1,
      limit: 10,
    },
    ...overrides,
  });

  const mockFetchJson = (payload: unknown, status = 200) => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: status < 400,
      status,
      json: () => Promise.resolve(payload),
    });
    global.fetch = fetchMock;
    return fetchMock;
  };

  beforeEach(() => {
    const movies: Record<number, { id: number; title: string }> = {
      1: { id: 1, title: 'Phim A' },
      2: { id: 2, title: 'Phim B' },
    };

    movieService = {
      findOne: jest.fn((id: number) =>
        Promise.resolve(movies[id] ?? { id, title: `Phim ${id}` }),
      ),
      findByIds: jest.fn((ids: number[]) =>
        Promise.resolve(ids.map(id => movies[id]).filter(Boolean)),
      ),
    };

    cache = new FakeCacheService();

    service = new RecommendationsService(
      movieService as unknown as MoviesService,
      cache,
      { get: () => '100' } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getSimilarMovies — happy path', () => {
    it('map movie từ DB, trả score/rank theo snapshot', async () => {
      mockFetchJson(buildAiResponse());

      const res = await service.getSimilarMovies(1);

      expect(res.pagination).toEqual({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
      expect(res.result).toHaveLength(2);
      expect(res.result[0]).toMatchObject({
        id: 1,
        similarityScore: 0.92,
        rank: 1,
      });
      expect(res.result[1]).toMatchObject({
        id: 2,
        similarityScore: 0.81,
        rank: 2,
      });
    });

    it('gọi ai-service với topK = window (100)', async () => {
      const fetchMock = mockFetchJson(buildAiResponse());

      await service.getSimilarMovies(7);

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/similar/7');
      expect(calledUrl).toContain('topK=100');
    });

    it('topK của client chỉ cắt từ snapshot, không đổi window gọi AI', async () => {
      const fetchMock = mockFetchJson(buildAiResponse());

      const res = await service.getSimilarMovies(1, 1);

      expect(fetchMock.mock.calls[0][0] as string).toContain('topK=100');
      expect(res.result).toHaveLength(1);
      expect(res.pagination.limit).toBe(1);
    });

    it('lần 2 dùng cache: không gọi ai-service lần nữa', async () => {
      const fetchMock = mockFetchJson(buildAiResponse());

      await service.getSimilarMovies(1);
      await service.getSimilarMovies(1);

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('version tăng (phim đổi) → cache miss, gọi ai-service lại', async () => {
      const fetchMock = mockFetchJson(buildAiResponse());

      await service.getSimilarMovies(1);
      await cache.incr('cache:recommendation:ver:similar:1');
      await service.getSimilarMovies(1);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('getSimilarMovies — chuẩn hoá dữ liệu', () => {
    it('bỏ movie không tồn tại trong DB (không throw)', async () => {
      mockFetchJson(
        buildAiResponse({
          result: [
            { id: 1, title: 'Phim A', similarityScore: 0.9, rank: 1 },
            { id: 999, title: 'Không có trong DB', similarityScore: 0.8 },
          ],
        }),
      );

      const res = await service.getSimilarMovies(1);

      expect(res.result).toHaveLength(1);
      expect(res.result[0].id).toBe(1);
    });

    it('chuẩn hoá rank 1..n và bỏ id trùng', async () => {
      mockFetchJson(
        buildAiResponse({
          result: [
            { id: 1, title: 'Phim A', similarityScore: 0.9, rank: 42 },
            { id: 1, title: 'Phim A', similarityScore: 0.9, rank: 7 },
            { id: 2, title: 'Phim B', similarityScore: 0.8 },
          ],
        }),
      );

      const res = await service.getSimilarMovies(1);

      expect(res.result.map(item => item.rank)).toEqual([1, 2]);
      expect(res.pagination.total).toBe(2);
    });
  });

  describe('getSimilarMovies — lỗi ai-service', () => {
    it('payload sai schema → AppException 400 AI_SERVICE_ERROR (không phải ZodError)', async () => {
      mockFetchJson({ result: [{ id: 'not-a-number' }] });

      await expect(service.getSimilarMovies(1)).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: 'AI_SERVICE_ERROR',
      });
      await expect(service.getSimilarMovies(1)).rejects.toBeInstanceOf(
        AppException,
      );
    });

    it('thiếu pagination → AppException (không crash 500)', async () => {
      mockFetchJson({ result: [] });

      await expect(service.getSimilarMovies(1)).rejects.toBeInstanceOf(
        AppException,
      );
    });
  });
});
