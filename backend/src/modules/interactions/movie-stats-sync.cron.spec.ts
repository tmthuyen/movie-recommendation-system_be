jest.mock('@nestjs/schedule', () => ({ Cron: () => () => undefined }));

import { MovieStatsSyncCron } from './movie-stats-sync.cron';

describe('MovieStatsSyncCron', () => {
  it('03:00 đồng bộ dirty movie Redis → DB dưới lock và dọn dirty', async () => {
    const callback = jest.fn(() => Promise.resolve(undefined));
    const fallback = jest.fn(() => Promise.resolve(undefined));
    const lock = {
      runWithLockOrFallback: jest.fn(
        (
          _key: string,
          _ttl: number,
          _options: unknown,
          cb: () => Promise<unknown>,
        ) => callback().then(() => cb()),
      ),
    };
    const snapshot = {
      likeCount: 2,
      commentCount: 1,
      viewCount: 10,
      ratingCount: 3,
      voteAverage: 4.5,
      ratingTotal: 13.5,
      ratingAvg: 4.5,
    };
    const repo = { syncFromCache: jest.fn().mockResolvedValue(undefined) };
    const stats = {
      listDirtyMovieIds: jest.fn().mockResolvedValue([11]),
      getStats: jest.fn().mockResolvedValue(snapshot),
      clearDirty: jest.fn().mockResolvedValue(undefined),
      seedFromDb: jest.fn(),
    };

    const cron = new MovieStatsSyncCron(
      lock as never,
      repo as never,
      stats as never,
    );
    await cron.syncToDatabase();

    expect(lock.runWithLockOrFallback).toHaveBeenCalledWith(
      'lock:stats:sync',
      120,
      { waitMs: 0 },
      expect.any(Function),
      expect.any(Function),
    );
    expect(repo.syncFromCache).toHaveBeenCalledWith(11, snapshot);
    expect(stats.clearDirty).toHaveBeenCalledWith(11);
    expect(fallback).not.toHaveBeenCalled();
  });
});
