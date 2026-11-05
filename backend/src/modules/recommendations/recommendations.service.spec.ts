import { AppException } from '@/common/custom-exception/app-exception';
import { HttpStatus } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { MoviesService } from '@/modules/movies/movies.service';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
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
      // Phim nguồn luôn tồn tại (service throw NotFound nếu không).
      findOne: jest.fn((id: number) =>
        Promise.resolve(movies[id] ?? { id, title: `Phim ${id}` }),
      ),
      findByIds: jest.fn((ids: number[]) =>
        Promise.resolve(ids.map(id => movies[id]).filter(Boolean)),
      ),
    };

    service = new RecommendationsService(
      movieService as unknown as MoviesService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('getSimilarMovies — happy path', () => {
    it('map movie từ DB + giữ similarityScore và pagination của ai-service', async () => {
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
      expect(res.result[1]).toMatchObject({ id: 2, similarityScore: 0.81 });
    });

    it('gọi đúng URL ai-service với topK mặc định = 10', async () => {
      const fetchMock = mockFetchJson(buildAiResponse());

      await service.getSimilarMovies(7);

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/similar/7');
      expect(calledUrl).toContain('topK=10');
    });

    it('dùng topK do client truyền vào', async () => {
      const fetchMock = mockFetchJson(buildAiResponse());

      await service.getSimilarMovies(7, 3);

      expect(fetchMock.mock.calls[0][0] as string).toContain('topK=3');
    });
  });

  describe('getSimilarMovies — biên', () => {
    it('bỏ qua movie không tồn tại trong DB (không throw)', async () => {
      mockFetchJson(
        buildAiResponse({
          result: [
            { id: 1, title: 'Phim A', similarityScore: 0.9, rank: 1 },
            { id: 999, title: 'Không có trong DB', similarityScore: 0.8 },
          ],
          pagination: {
            total: 2,
            totalPages: 1,
            page: 1,
            limit: 10,
          },
        }),
      );

      const res = await service.getSimilarMovies(1);

      expect(res.result).toHaveLength(1);
      expect(res.result[0].id).toBe(1);
    });

    it('tính rank theo công thức khi ai-service không trả rank', async () => {
      mockFetchJson(
        buildAiResponse({
          result: [
            { id: 2, title: 'Phim B', similarityScore: 0.7 },
            { id: 1, title: 'Phim A', similarityScore: 0.6 },
          ],
          pagination: {
            total: 12,
            totalPages: 3,
            page: 2,
            limit: 5,
          },
        }),
      );

      const res = await service.getSimilarMovies(1);

      // (page - 1) * limit + index + 1
      expect(res.result[0].rank).toBe(6);
      expect(res.result[1].rank).toBe(7);
    });

    it('giữ nguyên rank do ai-service trả về', async () => {
      mockFetchJson(
        buildAiResponse({
          result: [{ id: 1, title: 'Phim A', similarityScore: 0.9, rank: 42 }],
        }),
      );

      const res = await service.getSimilarMovies(1);

      expect(res.result[0].rank).toBe(42);
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
