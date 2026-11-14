import { z } from 'zod';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '@/infrastructure/redis/redis.service';
import { RedisCacheService } from './redis-cache.service';

/** Redis client giß║ú lß║¡p ─æß╗º API m├á `RedisCacheService` d├╣ng. */
class MemoryRedis {
  readonly store = new Map<string, string>();

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  set(
    key: string,
    value: string,
    ...args: (string | number)[]
  ): Promise<'OK' | null> {
    const hasNx = args.includes('NX');
    if (hasNx && this.store.has(key)) return Promise.resolve(null);
    this.store.set(key, value);
    return Promise.resolve('OK');
  }

  del(key: string): Promise<number> {
    return Promise.resolve(this.store.delete(key) ? 1 : 0);
  }

  incr(key: string): Promise<number> {
    const next = Number(this.store.get(key) ?? 0) + 1;
    this.store.set(key, String(next));
    return Promise.resolve(next);
  }

  eval(
    _script: string,
    _numKeys: number,
    key: string,
    token: string,
  ): Promise<number> {
    if (this.store.get(key) === token) {
      this.store.delete(key);
      return Promise.resolve(1);
    }
    return Promise.resolve(0);
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('RedisCacheService', () => {
  let memory: MemoryRedis;
  let service: RedisCacheService;

  const buildService = (enabled = true) => {
    memory = new MemoryRedis();
    const redisService = {
      get: (key: string) => memory.get(key),
      set: (key: string, value: string, ttl?: number) =>
        memory.set(key, value, 'EX', ttl ?? 0),
      del: (key: string) => memory.del(key),
      getClient: () => memory,
    };

    const config = {
      get: (key: string, defaultValue?: unknown) =>
        key === 'CACHE_ENABLED' ? String(enabled) : defaultValue,
    };

    return new RedisCacheService(
      redisService as unknown as RedisService,
      config as unknown as ConfigService,
    );
  };

  const itemSchema = z.object({ id: z.number(), title: z.string() });

  beforeEach(() => {
    service = buildService();
  });

  it('chß║╖n key kh├┤ng bß║»t ─æß║ºu bß║▒ng "cache:"', async () => {
    await expect(service.get('movie:1', itemSchema)).rejects.toThrow(/cache:/);
  });

  it('trß║ú dß╗» liß╗çu khi JSON + schema hß╗úp lß╗ç', async () => {
    await service.set('cache:t', { id: 1, title: 'A' }, 10);

    await expect(service.get('cache:t', itemSchema)).resolves.toEqual({
      id: 1,
      title: 'A',
    });
  });

  it('JSON hß╗Ång ΓåÆ xo├í key v├á coi nh╞░ miss', async () => {
    memory.store.set('cache:t', '{not-json');

    await expect(service.get('cache:t', itemSchema)).resolves.toBeNull();
    expect(memory.store.has('cache:t')).toBe(false);
  });

  it('sai schema ΓåÆ xo├í key v├á coi nh╞░ miss', async () => {
    memory.store.set('cache:t', JSON.stringify({ id: 'wrong' }));

    await expect(service.get('cache:t', itemSchema)).resolves.toBeNull();
    expect(memory.store.has('cache:t')).toBe(false);
  });

  it('Redis lß╗ùi khi ─æß╗ìc ΓåÆ fail-open (null)', async () => {
    const redisService = {
      get: () => Promise.reject(new Error('redis down')),
      set: jest.fn(),
      del: jest.fn(),
      getClient: () => memory,
    };
    const broken = new RedisCacheService(
      redisService as unknown as RedisService,
      { get: () => 'true' } as unknown as ConfigService,
    );

    await expect(broken.get('cache:t', itemSchema)).resolves.toBeNull();
  });

  it('CACHE_ENABLED=false ΓåÆ lu├┤n miss, vß║½n trß║ú dß╗» liß╗çu loader', async () => {
    service = buildService(false);
    const loader = jest.fn().mockResolvedValue([{ id: 1 }]);

    const result = await service.getOrLoad({
      key: 'cache:x',
      schema: z.array(z.object({ id: z.number() })),
      ttlSeconds: 30,
      loader,
    });

    expect(result).toEqual([{ id: 1 }]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(memory.store.has('cache:x')).toBe(false);
  });

  it('getOrLoad: hit th├¼ kh├┤ng gß╗ìi loader', async () => {
    await service.set('cache:hit', { id: 1, title: 'A' }, 10);
    const loader = jest.fn();

    await service.getOrLoad({
      key: 'cache:hit',
      schema: itemSchema,
      ttlSeconds: 10,
      loader,
    });

    expect(loader).not.toHaveBeenCalled();
  });

  it('TTL c├│ jitter trong khoß║úng [ttl, ttl*1.1]', async () => {
    const setSpy = jest.spyOn(memory, 'set');

    await service.getOrLoad({
      key: 'cache:jitter',
      schema: z.array(z.number()),
      ttlSeconds: 100,
      loader: () => Promise.resolve([1]),
    });

    const cacheWrite = setSpy.mock.calls.find(
      call => call[0] === 'cache:jitter',
    );
    const ttlArg = cacheWrite?.[3] as number;
    expect(ttlArg).toBeGreaterThanOrEqual(100);
    expect(ttlArg).toBeLessThanOrEqual(110);
  });

  it('single-flight: 2 request ─æß╗ông thß╗¥i ΓåÆ loader chß╗ë chß║íy 1 lß║ºn', async () => {
    const loader = jest.fn(async () => {
      await sleep(20);
      return [{ id: 1 }];
    });
    const schema = z.array(z.object({ id: z.number() }));

    const [first, second] = await Promise.all([
      service.getOrLoad({ key: 'cache:lock', schema, ttlSeconds: 10, loader }),
      service.getOrLoad({ key: 'cache:lock', schema, ttlSeconds: 10, loader }),
    ]);

    expect(loader).toHaveBeenCalledTimes(1);
    expect(first).toEqual([{ id: 1 }]);
    expect(second).toEqual([{ id: 1 }]);
  });

  it('counter: incr/getCounter', async () => {
    expect(await service.getCounter('cache:ver')).toBe(0);
    expect(await service.incr('cache:ver')).toBe(1);
    expect(await service.incr('cache:ver')).toBe(2);
    expect(await service.getCounter('cache:ver')).toBe(2);
  });
});
