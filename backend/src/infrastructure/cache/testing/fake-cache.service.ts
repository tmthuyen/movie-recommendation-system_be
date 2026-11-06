import type { z } from 'zod';
import type {
  CacheLoadOptions,
  ICacheService,
} from '@/infrastructure/cache/redis-cache.service';

/** Implementation in-memory của `ICacheService` dùng cho unit test. */
export class FakeCacheService implements ICacheService {
  private readonly store = new Map<string, string>();
  readonly setCalls: Array<{ key: string; ttlSeconds: number }> = [];
  readonly delCalls: string[] = [];
  loaderCalls = 0;
  /** `true` để `get` luôn trả `null`. */
  failOnGet = false;

  get<T>(key: string, schema: z.ZodType): Promise<T | null> {
    return Promise.resolve(this.read<T>(key, schema));
  }

  private read<T>(key: string, schema: z.ZodType): T | null {
    if (this.failOnGet) return null;

    const raw = this.store.get(key);
    if (raw === undefined) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.store.delete(key);
      return null;
    }

    const result = schema.safeParse(parsed);
    if (!result.success) {
      this.store.delete(key);
      return null;
    }
    return result.data as T;
  }

  set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.setCalls.push({ key, ttlSeconds });
    this.store.set(key, JSON.stringify(value));
    return Promise.resolve();
  }

  del(key: string): Promise<void> {
    this.delCalls.push(key);
    this.store.delete(key);
    return Promise.resolve();
  }

  async getOrLoad<T>(opts: CacheLoadOptions<T>): Promise<T> {
    const cached = await this.get<T>(opts.key, opts.schema);
    if (cached !== null) return cached;

    this.loaderCalls += 1;
    const loaded = await opts.loader();
    await this.set(opts.key, loaded, opts.ttlSeconds);
    return loaded;
  }

  incr(key: string): Promise<number> {
    const next = this.readCounter(key) + 1;
    this.store.set(key, String(next));
    return Promise.resolve(next);
  }

  getCounter(key: string): Promise<number> {
    return Promise.resolve(this.readCounter(key));
  }

  private readCounter(key: string): number {
    const value = Number(this.store.get(key));
    return Number.isFinite(value) ? value : 0;
  }

  peek(key: string): string | undefined {
    return this.store.get(key);
  }

  /** Seed raw value cho test invalid schema. */
  seedRaw(key: string, raw: string): void {
    this.store.set(key, raw);
  }

  reset(): void {
    this.store.clear();
    this.setCalls.length = 0;
    this.delCalls.length = 0;
    this.loaderCalls = 0;
    this.failOnGet = false;
  }
}
