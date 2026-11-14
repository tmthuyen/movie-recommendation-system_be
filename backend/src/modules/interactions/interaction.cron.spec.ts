jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
}));

jest.mock('uuid', () => ({
  v4: () => '00000000-0000-0000-0000-000000000000',
}));

import { InteractionCronService } from './interaction.cron';
import { IInteractionRepository } from './interactions.repository';
import { ISeedRatingRepository } from '../ratings/seed-ratings.repository';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { IRedisLockService } from '@/infrastructure/redis/redis-lock.service';
import { RedisService } from '@/infrastructure/redis/redis.service';
import { IStorageService } from '@/infrastructure/storage/storage.service';
import { InteractionType } from './entities/interaction.entity';

describe('InteractionCronService', () => {
  let service: InteractionCronService;
  let repo: Record<string, jest.Mock>;
  let seedRepo: Record<string, jest.Mock>;
  let producer: { publishTrainingRequest: jest.Mock };
  let lockService: { runWithLock: jest.Mock };
  let redisService: { hgetall: jest.Mock; hset: jest.Mock };
  let storage: { uploadBuffer: jest.Mock };
  let loggerError: jest.SpyInstance;

  const interaction = {
    id: 10,
    type: InteractionType.LIKE,
    score: 1,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    user: { id: 'u1' },
    movie: { id: 2 },
  };

  beforeEach(() => {
    repo = { findLatestByCreatedAtAndId: jest.fn() };
    seedRepo = { findBatch: jest.fn() };
    producer = { publishTrainingRequest: jest.fn() };
    lockService = {
      runWithLock: jest.fn(
        async (
          _key: string,
          _ttl: number,
          callback: () => Promise<void>,
        ): Promise<void> => callback(),
      ),
    };
    redisService = {
      hgetall: jest.fn().mockResolvedValue({}),
      hset: jest.fn(),
    };
    storage = {
      uploadBuffer: jest
        .fn()
        .mockResolvedValue('https://cdn.example.com/batch.jsonl'),
    };

    service = new InteractionCronService(
      repo as unknown as IInteractionRepository,
      seedRepo as unknown as ISeedRatingRepository,
      producer as unknown as InteractionProducer,
      lockService as unknown as IRedisLockService,
      redisService as unknown as RedisService,
      storage as unknown as IStorageService,
    );

    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    loggerError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('gửi batch mới, lưu checkpoint và publish training request', async () => {
    redisService.hgetall.mockResolvedValue({
      lastCreatedAt: '2025-12-31T00:00:00.000Z',
      lastId: '9',
    });
    repo.findLatestByCreatedAtAndId
      .mockResolvedValueOnce({
        data: [interaction],
        nextCursor: {
          lastCreatedAt: '2026-01-01T00:00:00.000Z',
          lastId: 10,
        },
      })
      .mockResolvedValueOnce({ data: [], nextCursor: null });

    await service.handleBatchTrainingUpload();

    expect(lockService.runWithLock).toHaveBeenCalledWith(
      'interaction:training:lock',
      60,
      expect.any(Function),
    );
    expect(repo.findLatestByCreatedAtAndId).toHaveBeenNthCalledWith(
      1,
      '2025-12-31T00:00:00.000Z',
      9,
      10000,
    );

    const uploadArgs = storage.uploadBuffer.mock.calls[0] as [
      Buffer,
      string,
      string,
    ];
    expect(uploadArgs[1]).toBe('interactions/interactions_10_10.jsonl');
    expect(uploadArgs[2]).toBe('application/jsonl');
    expect(uploadArgs[0].toString('utf-8')).toContain('"userId":"u1"');
    expect(uploadArgs[0].toString('utf-8')).toContain('"movieId":2');

    expect(redisService.hset).toHaveBeenCalledWith(
      'interaction:training:checkpoint',
      {
        lastCreatedAt: '2026-01-01T00:00:00.000Z',
        lastId: '10',
      },
      24 * 60 * 60,
    );
    expect(producer.publishTrainingRequest).toHaveBeenCalledWith(
      { folder: 'interactions' },
      expect.any(String),
    );
  });

  it('không có checkpoint/interaction mới → không upload, vẫn publish request', async () => {
    repo.findLatestByCreatedAtAndId.mockResolvedValue({
      data: [],
      nextCursor: null,
    });

    await service.handleBatchTrainingUpload();

    expect(repo.findLatestByCreatedAtAndId).toHaveBeenCalledWith(
      null,
      null,
      10000,
    );
    expect(storage.uploadBuffer).not.toHaveBeenCalled();
    expect(redisService.hset).not.toHaveBeenCalled();
    expect(producer.publishTrainingRequest).toHaveBeenCalledTimes(1);
  });

  it('lỗi khi query DB → log và rethrow để nhả lock', async () => {
    const dbError = new Error('db down');
    repo.findLatestByCreatedAtAndId.mockRejectedValue(dbError);

    await expect(service.handleBatchTrainingUpload()).rejects.toBe(dbError);

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to run interaction batch cron job',
      dbError,
    );
    expect(producer.publishTrainingRequest).not.toHaveBeenCalled();
  });
});
