import type { IRedisService } from '@/infrastructure/redis/redis.service';

import { MovieInteractionStatsService } from './movie-interaction-stats.service';

class FakeRedis {
  readonly hashes = new Map<string, Record<string, string>>();
  readonly zsets = new Map<string, Map<string, number>>();
  readonly sets = new Map<string, Set<string>>();

  hsetIfAbsent(
    key: string,
    obj: Record<string, string>,
    _ttl: number,
  ): Promise<void> {
    void _ttl;
    if (!this.hashes.has(key)) this.hashes.set(key, { ...obj });
    return Promise.resolve();
  }

  hset(key: string, obj: Record<string, string>, _ttl: number): Promise<void> {
    void _ttl;
    this.hashes.set(key, { ...(this.hashes.get(key) ?? {}), ...obj });
    return Promise.resolve();
  }

  hgetall(key: string): Promise<Record<string, string>> {
    return Promise.resolve({ ...(this.hashes.get(key) ?? {}) });
  }

  hincrby(key: string, field: string, delta: number): Promise<number> {
    const hash = this.hashes.get(key) ?? {};
    const next = Number(hash[field] ?? 0) + delta;
    hash[field] = String(next);
    this.hashes.set(key, hash);
    return Promise.resolve(next);
  }

  zincrby(
    key: string,
    delta: number,
    member: string,
    _ttl: number,
  ): Promise<number> {
    void _ttl;
    const zset = this.zsets.get(key) ?? new Map<string, number>();
    const next = (zset.get(member) ?? 0) + delta;
    zset.set(member, next);
    this.zsets.set(key, zset);
    return Promise.resolve(next);
  }

  zaddMax(
    key: string,
    score: number,
    member: string,
    _ttl: number,
  ): Promise<void> {
    void _ttl;
    const zset = this.zsets.get(key) ?? new Map<string, number>();
    zset.set(member, Math.max(zset.get(member) ?? 0, score));
    this.zsets.set(key, zset);
    return Promise.resolve();
  }

  zrevrangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<Array<{ member: string; score: number }>> {
    const zset = this.zsets.get(key) ?? new Map<string, number>();
    return Promise.resolve(
      [...zset.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(start, stop + 1)
        .map(([member, score]) => ({ member, score })),
    );
  }

  sadd(key: string, value: string, _ttl: number): Promise<void> {
    void _ttl;
    const set = this.sets.get(key) ?? new Set<string>();
    set.add(value);
    this.sets.set(key, set);
    return Promise.resolve();
  }

  smembers(key: string): Promise<string[]> {
    return Promise.resolve([...(this.sets.get(key) ?? [])]);
  }

  srem(key: string, value: string): Promise<void> {
    this.sets.get(key)?.delete(value);
    return Promise.resolve();
  }
}

describe('MovieInteractionStatsService', () => {
  let redis: FakeRedis;
  let service: MovieInteractionStatsService;
  let repo: { findOneForBootstrap: jest.Mock };
  let lock: { runWithLockOrFallback: jest.Mock };

  const zeroStats = {
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    ratingCount: 0,
    voteAverage: 0,
    ratingTotal: 0,
    ratingAvg: 0,
  };

  beforeEach(() => {
    redis = new FakeRedis();
    repo = {
      findOneForBootstrap: jest.fn((movieId: number) =>
        Promise.resolve({ movieId, ...zeroStats }),
      ),
    };
    lock = {
      runWithLockOrFallback: jest.fn(
        (
          _key: string,
          _ttl: number,
          _options: unknown,
          callback: () => Promise<unknown>,
        ) => callback(),
      ),
    };
    service = new MovieInteractionStatsService(
      redis as unknown as IRedisService,
      lock as never,
      repo as never,
    );
  });

  it('cache miss → load DB dưới lock, ghi cache và trả stats DB', async () => {
    repo.findOneForBootstrap.mockResolvedValue({
      movieId: 7,
      likeCount: 2,
      commentCount: 3,
      viewCount: 5,
      ratingCount: 4,
      voteAverage: 4.5,
      ratingTotal: 18,
      ratingAvg: 4.5,
    });

    await expect(service.getStats(7)).resolves.toEqual({
      likeCount: 2,
      commentCount: 3,
      viewCount: 5,
      ratingCount: 4,
      voteAverage: 4.5,
      ratingTotal: 18,
      ratingAvg: 4.5,
    });
    expect(lock.runWithLockOrFallback).toHaveBeenCalledWith(
      'lock:stats:load:7',
      5,
      { waitMs: 1000, retryIntervalMs: 25 },
      expect.any(Function),
      expect.any(Function),
    );
    expect(repo.findOneForBootstrap).toHaveBeenCalledWith(7);
    expect(redis.hashes.get('cache:stats:movie:7')).toEqual({
      likeCount: '2',
      commentCount: '3',
      viewCount: '5',
      ratingCount: '4',
      voteAverage: '4.5',
      ratingTotal: '18',
      ratingAvg: '4.5',
    });
    expect(redis.zsets.get('cache:stats:popular:all')?.get('7')).toBe(14);
  });

  it('cache hit thì không load DB', async () => {
    await service.getStats(7);
    repo.findOneForBootstrap.mockClear();

    await service.getStats(7);
    expect(repo.findOneForBootstrap).not.toHaveBeenCalled();
  });

  it('recordView tăng hash, popular/hot/top và đánh dấu dirty', async () => {
    const result = await service.recordView(7);

    expect(result.viewCount).toBe(1);
    expect(redis.zsets.get('cache:stats:popular:all')?.get('7')).toBe(1);
    expect(redis.zsets.get('cache:stats:hot:all')?.get('7')).toBe(1);
    expect(redis.zsets.get('cache:stats:top:view:all')?.get('7')).toBe(1);
    expect(await service.listDirtyMovieIds()).toEqual([7]);
  });

  it('recordRating giữ count khi update và dùng điểm TB ×10 cho top', async () => {
    await service.recordRating(7, 1, 4);
    await expect(service.recordRating(7, 0, 1)).resolves.toMatchObject({
      ratingCount: 1,
      ratingTotal: 5,
      ratingAvg: 5,
      voteAverage: 5,
    });
    expect(redis.zsets.get('cache:stats:top:rating:all')?.get('7')).toBe(50);
  });

  it('setRatingStats ghi số liệu từ DB và cập nhật ranking', async () => {
    await expect(service.setRatingStats(7, 3, 4.5)).resolves.toMatchObject({
      ratingCount: 3,
      ratingTotal: 13.5,
      ratingAvg: 4.5,
      voteAverage: 4.5,
    });
    expect(redis.zsets.get('cache:stats:top:rating:all')?.get('7')).toBe(45);
    expect(await service.listDirtyMovieIds()).toEqual([7]);
  });

  it('getRanking hot trả đúng thứ tự score giảm dần', async () => {
    await service.recordView(1);
    await service.recordView(2);
    await service.recordView(2);

    await expect(service.getRanking('hot', 'all', 'all', 10)).resolves.toEqual([
      { movieId: 2, score: 2 },
      { movieId: 1, score: 1 },
    ]);
  });

  it('clearDirty xoá id khỏi hàng đợi đồng bộ', async () => {
    await service.recordLike(9, 1);
    expect(await service.listDirtyMovieIds()).toEqual([9]);

    await service.clearDirty(9);
    expect(await service.listDirtyMovieIds()).toEqual([]);
  });
});
