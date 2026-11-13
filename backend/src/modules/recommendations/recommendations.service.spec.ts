import { AppException } from '@/common/custom-exception/app-exception';
import { HttpStatus } from '@nestjs/common';
import { RecommendationsService } from './recommendations.service';
import { MoviesService } from '@/modules/movies/movies.service';
import { FakeCacheService } from '@/infrastructure/cache/testing/fake-cache.service';
import { RedisService } from '@/infrastructure/redis/redis.service';
import {
  encodeCursor,
  fingerprintIds,
} from '@/common/utils/cursor-pagination.util';

/** Redis sorted set tối giản cho test (score = rank). */
function createFakeRedis() {
  const store = new Map<string, Array<{ score: number; member: string }>>();

  return {
    zadd: jest.fn(
      (
        key: string,
        entries: Array<{ score: number; member: string }>,
      ): Promise<void> => {
        const current = store.get(key) ?? [];
        for (const entry of entries) {
          const index = current.findIndex(item => item.member === entry.member);
          if (index >= 0) current[index] = entry;
          else current.push(entry);
        }
        store.set(key, current);
        return Promise.resolve();
      },
    ),
    zrangeByScore: jest.fn(
      (
        key: string,
        min: string | number,
        max: string | number,
        limit: number,
      ): Promise<string[]> => {
        const exclusive = typeof min === 'string' && min.startsWith('(');
        const minValue = Number(
          typeof min === 'string' ? min.replace('(', '') : min,
        );
        const maxValue =
          max === '+inf'
            ? Number.POSITIVE_INFINITY
            : Number(typeof max === 'string' ? max.replace('(', '') : max);

        return Promise.resolve(
          [...(store.get(key) ?? [])]
            .sort((a, b) => a.score - b.score)
            .filter(item =>
              exclusive ? item.score > minValue : item.score >= minValue,
            )
            .filter(item => item.score <= maxValue)
            .slice(0, limit)
            .map(item => item.member),
        );
      },
    ),
    zcard: jest.fn((key: string): Promise<number> =>
      Promise.resolve(store.get(key)?.length ?? 0),
    ),
  };
}

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let cache: FakeCacheService;
  let redis: {
    zadd: jest.Mock;
    zrangeByScore: jest.Mock;
    zcard: jest.Mock;
  };
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

  const buildAiResponseForIds = (ids: number[]) =>
    buildAiResponse({
      result: ids.map((id, index) => ({
        id,
        title: `Phim ${id}`,
        similarityScore: 0.9 - index * 0.01,
      })),
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
      3: { id: 3, title: 'Phim C' },
      4: { id: 4, title: 'Phim D' },
      5: { id: 5, title: 'Phim E' },
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

    redis = createFakeRedis();

    service = new RecommendationsService(
      movieService as unknown as MoviesService,
      cache,
      redis as unknown as RedisService,
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
        score: 0.92,
        rank: 1,
      });
      expect(res.result[1]).toMatchObject({
        id: 2,
        score: 0.81,
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

  describe('getSimilarMoviesByCursor', () => {
    it('trang đầu gọi AI 1 lần, trả đúng limit và nextCursor', async () => {
      const fetchMock = mockFetchJson(buildAiResponseForIds([1, 2, 3, 4, 5]));

      const res = await service.getSimilarMoviesByCursor(1, { limit: 2 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res.result.map(item => item.id)).toEqual([1, 2]);
      expect(res.pagination).toMatchObject({
        limit: 2,
        total: 5,
        hasMore: true,
      });
      expect(res.pagination.nextCursor).not.toBeNull();
    });

    it('trang 2/3 dùng nextCursor, không gọi AI lần nữa', async () => {
      const fetchMock = mockFetchJson(buildAiResponseForIds([1, 2, 3, 4, 5]));

      const page1 = await service.getSimilarMoviesByCursor(1, { limit: 2 });
      const page2 = await service.getSimilarMoviesByCursor(1, {
        limit: 2,
        cursor: page1.pagination.nextCursor as string,
      });
      const page3 = await service.getSimilarMoviesByCursor(1, {
        limit: 2,
        cursor: page2.pagination.nextCursor as string,
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(page2.result.map(item => item.id)).toEqual([3, 4]);
      expect(page3.result.map(item => item.id)).toEqual([5]);
      expect(page3.pagination).toEqual({
        limit: 2,
        total: 5,
        hasMore: false,
        nextCursor: null,
      });
    });

    it('skip movie không còn trong DB và fill item phía sau', async () => {
      mockFetchJson(buildAiResponseForIds([1, 999, 2, 3]));

      const page1 = await service.getSimilarMoviesByCursor(1, { limit: 2 });

      expect(page1.result.map(item => item.id)).toEqual([1, 2]);
      expect(page1.pagination.hasMore).toBe(true);

      const page2 = await service.getSimilarMoviesByCursor(1, {
        limit: 2,
        cursor: page1.pagination.nextCursor as string,
      });

      expect(page2.result.map(item => item.id)).toEqual([3]);
      expect(page2.pagination.hasMore).toBe(false);
    });

    it('cursor hỏng → 400 INVALID_CURSOR', async () => {
      mockFetchJson(buildAiResponseForIds([1, 2, 3]));

      await expect(
        service.getSimilarMoviesByCursor(1, { cursor: 'bad-cursor' }),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: 'INVALID_CURSOR',
      });
    });

    it('cursor của movie khác → 400 INVALID_CURSOR', async () => {
      mockFetchJson(buildAiResponseForIds([1, 2, 3]));

      const page1 = await service.getSimilarMoviesByCursor(1, { limit: 1 });

      await expect(
        service.getSimilarMoviesByCursor(2, {
          limit: 1,
          cursor: page1.pagination.nextCursor as string,
        }),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: 'INVALID_CURSOR',
      });
    });

    it('version tăng giữa 2 trang → 409 CURSOR_EXPIRED', async () => {
      mockFetchJson(buildAiResponseForIds([1, 2, 3]));

      const page1 = await service.getSimilarMoviesByCursor(1, { limit: 1 });
      await cache.incr('cache:recommendation:ver:similar:1');

      await expect(
        service.getSimilarMoviesByCursor(1, {
          limit: 1,
          cursor: page1.pagination.nextCursor as string,
        }),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        errorCode: 'CURSOR_EXPIRED',
      });
    });

    it('snapshot đổi fingerprint (cache reload) → 409 CURSOR_EXPIRED', async () => {
      mockFetchJson(buildAiResponseForIds([1, 2, 3]));

      const page1 = await service.getSimilarMoviesByCursor(1, { limit: 1 });
      await cache.del('cache:recommendation:similar:1:k100:v0');
      mockFetchJson(buildAiResponseForIds([3, 2, 1]));

      await expect(
        service.getSimilarMoviesByCursor(1, {
          limit: 1,
          cursor: page1.pagination.nextCursor as string,
        }),
      ).rejects.toMatchObject({
        statusCode: HttpStatus.CONFLICT,
        errorCode: 'CURSOR_EXPIRED',
      });
    });

    it('offset bằng cuối danh sách → trang rỗng, hasMore=false', async () => {
      mockFetchJson(buildAiResponseForIds([1, 2]));

      await service.getSimilarMoviesByCursor(1, { limit: 2 });
      const cursorAtEnd = encodeCursor({
        v: 0,
        s: 'similar:1',
        o: 2,
        f: fingerprintIds([1, 2]),
      });

      const page2 = await service.getSimilarMoviesByCursor(1, {
        limit: 2,
        cursor: cursorAtEnd,
      });

      expect(page2.result).toEqual([]);
      expect(page2.pagination).toEqual({
        limit: 2,
        total: 2,
        hasMore: false,
        nextCursor: null,
      });
    });

    it('limit mặc định là 12 khi không truyền', async () => {
      mockFetchJson(buildAiResponseForIds([1, 2, 3]));

      const res = await service.getSimilarMoviesByCursor(1, {});

      expect(res.pagination.limit).toBe(12);
      expect(res.result).toHaveLength(3);
    });

    it('limit vượt max bị clamp về 50', async () => {
      mockFetchJson(buildAiResponseForIds([1, 2, 3]));

      const res = await service.getSimilarMoviesByCursor(1, { limit: 100 });

      expect(res.pagination.limit).toBe(50);
      expect(res.result).toHaveLength(3);
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

  describe('semanticSearch', () => {
    const buildSemanticResponse = (ids: number[]) => ({
      result: ids.map(id => ({
        id,
        title: `Phim ${id}`,
        similarityScore: 1 - id / 100,
        score: 1 - id / 100,
      })),
      pagination: { total: ids.length, totalPages: 1, page: 1, limit: 100 },
    });

    it('gọi ai-service với keyword + topK=window, map score/rank', async () => {
      const fetchMock = mockFetchJson(buildSemanticResponse([1, 2]));

      const res = await service.semanticSearch('hành động', 1);

      const calledUrl = fetchMock.mock.calls[0][0] as string;
      expect(calledUrl).toContain('/semantic-search?keyword=');
      expect(calledUrl).toContain('topK=100');
      expect(res.result).toHaveLength(1);
      expect(res.result[0]).toMatchObject({
        id: 1,
        score: 0.99,
        rank: 1,
      });
      expect(res.pagination).toEqual({
        page: 1,
        limit: 1,
        total: 2,
        totalPages: 1,
      });
    });

    it('trang sau đọc ZSET, không gọi ai-service lần nữa', async () => {
      const fetchMock = mockFetchJson(buildSemanticResponse([1, 2, 3, 4, 5]));

      const page1 = await service.semanticSearchByCursor('hành động', {
        limit: 2,
      });
      const page2 = await service.semanticSearchByCursor('hành động', {
        limit: 2,
        cursor: String(page1.pagination.nextCursor),
      });
      const page3 = await service.semanticSearchByCursor('hành động', {
        limit: 2,
        cursor: String(page2.pagination.nextCursor),
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(page1.result.map(item => item.id)).toEqual([1, 2]);
      expect(page2.result.map(item => item.id)).toEqual([3, 4]);
      expect(page3.result.map(item => item.id)).toEqual([5]);
      expect(page3.pagination).toEqual({
        limit: 2,
        total: 5,
        hasMore: false,
        nextCursor: null,
      });
    });

    it('cursor là rank (số) — nextCursor = rank cuối trang', async () => {
      mockFetchJson(buildSemanticResponse([1, 2, 3]));

      const page1 = await service.semanticSearchByCursor('hành động', {
        limit: 2,
      });

      expect(page1.pagination).toEqual({
        limit: 2,
        total: 3,
        hasMore: true,
        nextCursor: 2,
      });
    });

    it('limit vượt max bị clamp về 50', async () => {
      mockFetchJson(buildSemanticResponse([1, 2, 3]));

      const res = await service.semanticSearchByCursor('hành động', {
        limit: 100,
      });

      expect(res.pagination.limit).toBe(50);
    });

    it('ai-service trả lỗi HTTP → AppException AI_SERVICE_ERROR', async () => {
      mockFetchJson({ detail: 'boom' }, 500);

      await expect(service.semanticSearch('hành động')).rejects.toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: 'AI_SERVICE_ERROR',
      });
    });
  });

  describe('hybridSearch', () => {
    const buildHybridResponse = (ids: number[]) => ({
      result: ids.map((id, index) => ({
        movie_id: id,
        fused_rank: index + 1,
        rrf_score: 0.5 - index * 0.01,
        id,
        rank: index + 1,
        score: 0.5 - index * 0.01,
      })),
      pagination: { total: ids.length, totalPages: 1, page: 1, limit: 100 },
    });

    it('gọi ai-service kèm JWT, không gửi userId', async () => {
      const fetchMock = mockFetchJson(buildHybridResponse([1, 2]));

      const res = await service.hybridSearch('user-1', 'access-token', 1);

      const [calledUrl, options] = fetchMock.mock.calls[0] as [
        string,
        { headers: Record<string, string> },
      ];
      expect(calledUrl).toContain('/hybrid?topK=100');
      expect(calledUrl).not.toContain('userId');
      expect(options.headers.Authorization).toBe('Bearer access-token');
      expect(res.result).toHaveLength(1);
      expect(res.result[0]).toMatchObject({
        id: 1,
        score: 0.5,
        rank: 1,
      });
    });

    it('trang sau đọc ZSET, không gọi ai-service lần nữa', async () => {
      const fetchMock = mockFetchJson(buildHybridResponse([1, 2, 3]));

      const page1 = await service.hybridSearchByCursor(
        'user-1',
        'access-token',
        { limit: 2 },
      );
      const page2 = await service.hybridSearchByCursor(
        'user-1',
        'access-token',
        { limit: 2, cursor: String(page1.pagination.nextCursor) },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(page1.result.map(item => item.id)).toEqual([1, 2]);
      expect(page2.result.map(item => item.id)).toEqual([3]);
      expect(page2.pagination).toEqual({
        limit: 2,
        total: 3,
        hasMore: false,
        nextCursor: null,
      });
    });
  });
});
