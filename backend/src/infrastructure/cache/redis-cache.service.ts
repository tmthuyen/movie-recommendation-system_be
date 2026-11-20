import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { z } from 'zod';
import { AppException } from '@/common/custom-exception/app-exception';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.service';
import { REDIS_LOCK_SERVICE } from '@/infrastructure/redis/redis-lock.service';
import type { IRedisLockService } from '@/infrastructure/redis/redis-lock.service';
import { cacheTypeFromKey } from './cache-metrics.service';
import type { CacheMetrics } from './cache-metrics.service';

export const CACHE_SERVICE = 'CACHE_SERVICE';

export interface CacheLoadOptions<T> {
  /** Key cache, bắt đầu bằng `cache:`. */
  key: string;
  /** Schema dùng để validate khi ghi và khi đọc. */
  schema: z.ZodType;
  ttlSeconds: number;
  /** Hàm tải dữ liệu, chỉ chạy khi cache miss và đã giữ lock. */
  loader: () => Promise<T>;
  /** Giá trị trả khi loader lỗi/không giành được lock và không có stale. */
  fallback?: () => T | Promise<T>;
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
const NEGATIVE_SUFFIX = ':nil';
const STALE_SUFFIX = ':stale';
const NEGATIVE_TTL_SECONDS = 60;
const CACHE_LOCK_TTL_SECONDS = 5;
const CACHE_LOCK_WAIT_MS = 150;
const CACHE_LOCK_RETRY_MS = 25;
const CACHE_TTL_JITTER = 0.2;

/** Cache Redis JSON với Zod, TTL jitter và single-flight. */
@Injectable()
export class RedisCacheService implements ICacheService {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly enabled: boolean;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly config: ConfigService,
    @Inject(REDIS_LOCK_SERVICE) private readonly cacheLock: IRedisLockService,
    @Optional() private readonly metrics?: CacheMetrics,
  ) {
    this.enabled = this.config.get<string>('CACHE_ENABLED', 'true') !== 'false';
  }

  /** Đọc cache theo schema; trả null khi miss, có cờ `:nil`, sai schema hoặc Redis lỗi. */
  async get<T>(key: string, schema: z.ZodType): Promise<T | null> {
    this.assertKey(key);
    if (!this.enabled) return null;

    try {
      if ((await this.redis.get(key + NEGATIVE_SUFFIX)) === '1') return null;

      const raw = await this.redis.get(key);
      if (raw === null) {
        this.metrics?.miss(cacheTypeFromKey(key));
        return null;
      }

      const parsed = this.parse<T>(raw, schema, key);
      if (parsed === null) return null;

      this.metrics?.hit(cacheTypeFromKey(key));
      return parsed;
    } catch (error) {
      this.logger.warn(
        `Đọc cache lỗi (bỏ qua): ${key} — ${this.errorMessage(error)}`,
      );
      return null;
    }
  }

  /** Ghi JSON vào key, lưu bản `:stale` với TTL gấp 3 và xoá cờ `:nil`. */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.assertKey(key);
    if (!this.enabled) return;

    try {
      const raw = JSON.stringify(value);
      await this.redis.set(key, raw, 'EX', this.withJitter(ttlSeconds));
      await this.redis.set(key + STALE_SUFFIX, raw, 'EX', ttlSeconds * 3);
      await this.redis.del(key + NEGATIVE_SUFFIX);
    } catch (error) {
      this.logger.warn(
        `Ghi cache lỗi (bỏ qua): ${key} — ${this.errorMessage(error)}`,
      );
    }
  }

  /** Xoá key cache, bỏ qua lỗi Redis. */
  async del(key: string): Promise<void> {
    this.assertKey(key);
    if (!this.enabled) return;
    await this.safeDel(key);
  }

  /** Đọc cache; khi miss thì load một lần dưới lock, fallback `:stale` nếu không giành được lock. */
  async getOrLoad<T>(opts: CacheLoadOptions<T>): Promise<T> {
    const cached = await this.get<T>(opts.key, opts.schema);
    if (cached !== null) return cached;
    if (!this.enabled) return opts.loader();

    const type = cacheTypeFromKey(opts.key);
    const startedAt = Date.now();

    try {
      return await this.cacheLock.runWithLockOrFallback<T>(
        `lock:${opts.key}`,
        CACHE_LOCK_TTL_SECONDS,
        { waitMs: CACHE_LOCK_WAIT_MS, retryIntervalMs: CACHE_LOCK_RETRY_MS },
        async () => {
          const rechecked = await this.get<T>(opts.key, opts.schema);
          if (rechecked !== null) return rechecked;

          let value: T;
          try {
            this.metrics?.loaderRun(type);
            value = await opts.loader();
          } catch (error) {
            this.logger.error(
              `Loader cache thất bại: ${opts.key} — ${this.errorMessage(error)}`,
            );
            return this.fallbackValue(opts, type);
          }

          if (value === null || value === undefined) {
            await this.redis
              .set(opts.key + NEGATIVE_SUFFIX, '1', 'EX', NEGATIVE_TTL_SECONDS)
              .catch(() => undefined);
            return value;
          }

          const checked = opts.schema.safeParse(value);
          if (!checked.success) {
            this.metrics?.schemaRejected(type);
            this.logger.error(
              `Dữ liệu không khớp schema cache: ${opts.key} — ${checked.error.message}`,
            );
            return this.readStale(opts, type);
          }

          await this.set(opts.key, checked.data, opts.ttlSeconds);
          return checked.data as T;
        },
        async () => {
          this.metrics?.lockFailed(type);
          const stale = await this.readStale(opts, type);
          if (stale !== null) return stale;
          return this.fallbackValue(opts, type);
        },
      );
    } finally {
      this.metrics?.observeLoader(type, Date.now() - startedAt);
    }
  }

  /** Tăng counter Redis, trả giá trị sau khi tăng hoặc 0 nếu Redis lỗi. */
  async incr(key: string): Promise<number> {
    this.assertKey(key);
    try {
      return await this.redis.incr(key);
    } catch (error) {
      this.logger.warn(`INCR cache lỗi: ${key} — ${this.errorMessage(error)}`);
      return 0;
    }
  }

  /** Đọc counter Redis về number; trả 0 nếu giá trị không hợp lệ hoặc Redis lỗi. */
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

  /** Parse JSON và validate schema; xoá key nếu không hợp lệ. */
  private parse<T>(raw: string, schema: z.ZodType, key: string): T | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      void this.safeDel(key);
      this.logger.warn(`Cache value không phải JSON, đã xoá: ${key}`);
      return null;
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      void this.safeDel(key);
      this.metrics?.schemaRejected(cacheTypeFromKey(key));
      this.logger.warn(`Cache sai schema, đã xoá: ${key}`);
      return null;
    }

    return result.data as T;
  }

  /** Đọc bản `:stale` theo schema; trả fallback nếu stale không dùng được. */
  private async readStale<T>(
    opts: CacheLoadOptions<T>,
    type: string,
  ): Promise<T> {
    try {
      const raw = await this.redis.get(opts.key + STALE_SUFFIX);
      if (raw !== null) {
        const parsed = this.parse<T>(raw, opts.schema, opts.key + STALE_SUFFIX);
        if (parsed !== null) {
          this.metrics?.staleServed(type);
          return parsed;
        }
      }
    } catch (error) {
      this.logger.warn(
        `Đọc stale lỗi: ${opts.key} — ${this.errorMessage(error)}`,
      );
    }
    return this.fallbackValue(opts, type);
  }

  /** Trả fallback của caller và ghi metric stale; trả null nếu không có fallback. */
  private async fallbackValue<T>(
    opts: CacheLoadOptions<T>,
    type: string,
  ): Promise<T> {
    if (!opts.fallback) return null as T;
    this.metrics?.staleServed(type);
    return opts.fallback();
  }

  /** Xoá cache và bỏ qua lỗi Redis. */
  private async safeDel(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch {
      return;
    }
  }

  /** Trả TTL kèm jitter 20%. */
  private withJitter(ttlSeconds: number): number {
    const extra = Math.floor(ttlSeconds * CACHE_TTL_JITTER * Math.random());
    return ttlSeconds + Math.max(1, extra);
  }

  /** Chuyển error về chuỗi để log. */
  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  /** Kiểm tra cache key bắt đầu bằng `cache:`. */
  private assertKey(key: string): void {
    if (!key.startsWith(KEY_PREFIX)) {
      throw new AppException(
        500,
        'Cache key không hợp lệ.',
        `Cache key must start with "${KEY_PREFIX}": ${key}`,
        'INVALID_CACHE_KEY',
      );
    }
  }
}
