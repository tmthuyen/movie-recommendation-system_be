import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { RedisService } from '@/infrastructure/redis/redis.service';

export const ICacheService = Symbol('ICacheService');
// interface
export interface CacheLoadOptions<T> {
  /** Key cache, bắt đầu bằng `cache:`. */
  key: string;
  /** Schema dùng để validate khi ghi và khi đọc. */
  schema: z.ZodType;
  ttlSeconds: number;
  /** Hàm tải dữ liệu, chỉ chạy khi cache miss. */
  loader: () => Promise<T>;
}

export interface ICacheService {
  get<T>(key: string, schema: z.ZodType): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  getOrLoad<T>(opts: CacheLoadOptions<T>): Promise<T>;
  /** Tăng counter, trả giá trị sau khi tăng. */
  incr(key: string): Promise<number>;
  getCounter(key: string): Promise<number>;
}

const KEY_PREFIX = 'cache:';
const LOCK_TTL_MS = 5000;
const LOCK_WAIT_MS = 120;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Implementation `ICacheService` trên Redis: JSON, validate Zod, TTL jitter,
 * single-flight và fail-open khi Redis lỗi.
 */
@Injectable()
export class RedisCacheService implements ICacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.enabled = this.config.get<string>('CACHE_ENABLED', 'true') !== 'false';
  }

  async get<T>(key: string, schema: z.ZodType): Promise<T | null> {
    this.assertKey(key);
    if (!this.enabled) return null;

    try {
      const raw = await this.redis.get(key);
      if (raw === null) return null;

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        await this.safeDel(key);
        this.logger.warn(`Cache value không phải JSON, đã xoá: ${key}`);
        return null;
      }

      const result = schema.safeParse(parsed);
      if (!result.success) {
        await this.safeDel(key);
        this.logger.warn(`Cache sai schema, đã xoá: ${key}`);
        return null;
      }

      return result.data as T;
    } catch (error) {
      this.logger.warn(
        `Đọc cache lỗi (bỏ qua): ${key} — ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.assertKey(key);
    if (!this.enabled) return;

    try {
      await this.redis.set(
        key,
        JSON.stringify(value),
        this.withJitter(ttlSeconds),
      );
    } catch (error) {
      this.logger.warn(
        `Ghi cache lỗi (bỏ qua): ${key} — ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async del(key: string): Promise<void> {
    this.assertKey(key);
    if (!this.enabled) return;
    await this.safeDel(key);
  }

  async getOrLoad<T>(opts: CacheLoadOptions<T>): Promise<T> {
    const cached = await this.get<T>(opts.key, opts.schema);
    if (cached !== null) return cached;

    if (!this.enabled) return opts.loader();

    return this.loadWithLock(opts);
  }

  async incr(key: string): Promise<number> {
    this.assertKey(key);
    try {
      return await this.redis.getClient().incr(key);
    } catch (error) {
      this.logger.warn(
        `INCR cache lỗi: ${key} — ${error instanceof Error ? error.message : String(error)}`,
      );
      return 0;
    }
  }

  async getCounter(key: string): Promise<number> {
    this.assertKey(key);
    try {
      const raw = await this.redis.get(key);
      const value = Number(raw);
      return Number.isFinite(value) ? value : 0;
    } catch {
      return 0;
    }
  }

  private async loadWithLock<T>(opts: CacheLoadOptions<T>): Promise<T> {
    const lockKey = `lock:${opts.key}`;
    const token = randomUUID();
    let locked = false;

    try {
      locked = await this.tryLock(lockKey, token);
      if (!locked) {
        await sleep(LOCK_WAIT_MS);
        const retry = await this.get<T>(opts.key, opts.schema);
        if (retry !== null) return retry;
      }

      const value = await opts.loader();
      const checked = opts.schema.safeParse(value);
      if (checked.success) {
        await this.set(opts.key, checked.data, opts.ttlSeconds);
      } else {
        this.logger.error(
          `Dữ liệu không khớp schema cache (không ghi): ${opts.key} — ${checked.error.message}`,
        );
      }

      return value;
    } finally {
      if (locked) await this.releaseLock(lockKey, token);
    }
  }

  private async tryLock(lockKey: string, token: string): Promise<boolean> {
    try {
      const result = await this.redis
        .getClient()
        .set(lockKey, token, 'PX', LOCK_TTL_MS, 'NX');
      return result === 'OK';
    } catch {
      return false;
    }
  }

  private async releaseLock(lockKey: string, token: string): Promise<void> {
    try {
      await this.redis
        .getClient()
        .eval(
          'if redis.call("get",KEYS[1])==ARGV[1] then return redis.call("del",KEYS[1]) else return 0 end',
          1,
          lockKey,
          token,
        );
    } catch {
      // lock tự hết hạn theo PX
    }
  }

  private async safeDel(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      // fail-open
    }
  }

  /** TTL kèm jitter tối đa 10%. */
  private withJitter(ttlSeconds: number): number {
    return ttlSeconds + Math.floor(Math.random() * ttlSeconds * 0.1);
  }

  private assertKey(key: string): void {
    if (!key.startsWith(KEY_PREFIX)) {
      throw new Error(`Cache key phải bắt đầu bằng "${KEY_PREFIX}": ${key}`);
    }
  }
}
