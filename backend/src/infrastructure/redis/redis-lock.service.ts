import { AppException } from '@/common/custom-exception/app-exception';
import { idUtil } from '@/common/utils/id.util';
import { REDIS_CLIENT } from '@/infrastructure/redis/redis.service';
import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_LOCK_SERVICE = 'REDIS_LOCK_SERVICE';

export interface LockRunOptions {
  /** Tổng thời gian chờ giành lock (ms). Mặc định 0 = thử 1 lần. */
  waitMs?: number;
  /** Khoảng cách giữa 2 lần thử (ms). */
  retryIntervalMs?: number;
}

export interface IRedisLockService {
  acquireLock(key: string, ttlSeconds: number): Promise<string | null>;
  releaseLock(key: string, lockValue: string): Promise<void>;
  extendLock(
    key: string,
    lockValue: string,
    ttlSeconds: number,
  ): Promise<boolean>;
  runWithLock<T>(
    key: string,
    ttlSeconds: number,
    callback: () => Promise<T>,
  ): Promise<T | null>;
  /** Chạy callback dưới lock, trả fallback khi hết hạn chờ. */
  runWithLockOrFallback<T>(
    key: string,
    ttlSeconds: number,
    options: LockRunOptions,
    callback: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T>;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

@Injectable()
export class RedisLockService implements IRedisLockService {
  private readonly logger = new Logger(RedisLockService.name);
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Giành lock bằng UUID; trả UUID nếu `SET NX` thành công, null nếu lock đã tồn tại. */
  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const lockValue = idUtil.generateUUID();

    const result = await this.redis.set(key, lockValue, 'EX', ttlSeconds, 'NX');

    return result === 'OK' ? lockValue : null;
  }

  /** Xoá lock chỉ khi `lockValue` khớp owner hiện tại. */
  async releaseLock(key: string, lockValue: string): Promise<void> {
    const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
      `;
    await this.redis.eval(script, 1, key, lockValue);
  }

  /** Gia hạn TTL nếu `lockValue` còn khớp; trả true khi gia hạn thành công. */
  async extendLock(
    key: string,
    lockValue: string,
    ttlSeconds: number,
  ): Promise<boolean> {
    const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("expire", KEYS[1], ARGV[2])
        else
            return 0
        end
      `;
    const res = await this.redis.eval(script, 1, key, lockValue, ttlSeconds);

    return Number(res) === 1;
  }

  /** Chạy callback dưới lock; ném 423 nếu không giành được lock. */
  async runWithLock<T>(
    key: string,
    ttlSeconds: number,
    callback: () => Promise<T>,
  ): Promise<T> {
    const lockValue = await this.acquireLock(key, ttlSeconds);

    if (!lockValue) {
      throw new AppException(
        423,
        'Tài nguyên đang được xử lý, vui lòng thử lại.',
        `Could not acquire lock for key: ${key}`,
        'LOCK_ACQUISITION_FAILED',
      );
    }

    return this.executeWithLockValue(key, ttlSeconds, lockValue, callback);
  }

  /** Thử giành lock trong `waitMs`, mỗi `retryIntervalMs`; hết hạn thì gọi `fallback`. */
  async runWithLockOrFallback<T>(
    key: string,
    ttlSeconds: number,
    options: LockRunOptions,
    callback: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    const deadline = Date.now() + Math.max(0, options.waitMs ?? 0);
    const retryMs = Math.max(10, options.retryIntervalMs ?? 25);

    while (true) {
      const lockValue = await this.acquireLock(key, ttlSeconds);
      if (lockValue) {
        return this.executeWithLockValue(key, ttlSeconds, lockValue, callback);
      }

      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        this.logger.warn(
          `Không giành được lock ${key}, dùng dữ liệu dự phòng.`,
        );
        return fallback();
      }

      await sleep(Math.min(retryMs, remaining));
    }
  }

  /**
   * Chạy callback dưới lock đã giành; watchdog gia hạn TTL và release ở finally.
   * @throws AppException 503 nếu mất quyền sở hữu lock.
   */
  private async executeWithLockValue<T>(
    key: string,
    ttlSeconds: number,
    lockValue: string,
    callback: () => Promise<T>,
  ): Promise<T> {
    const renewIntervalMs = (ttlSeconds * 1000) / 3;
    let stopped = false;
    let lostLock = false;
    let timer: NodeJS.Timeout | undefined;

    const watchdog = async (): Promise<void> => {
      if (stopped || lostLock) return;

      try {
        const renewed = await this.extendLock(key, lockValue, ttlSeconds);
        if (!renewed) {
          lostLock = true;
          this.logger.error(`Mất quyền sở hữu lock: ${key}`);
          return;
        }
      } catch (error) {
        lostLock = true;
        this.logger.error(`Gia hạn lock thất bại: ${key}`, error);
        return;
      }

      if (!stopped && !lostLock) {
        timer = setTimeout(() => void watchdog(), renewIntervalMs);
      }
    };

    timer = setTimeout(() => void watchdog(), renewIntervalMs);

    try {
      const result = await callback();
      if (lostLock) {
        throw new AppException(
          503,
          'Không duy trì được khóa, vui lòng thử lại.',
          `Lock ownership lost: ${key}`,
          'LOCK_LOST',
        );
      }
      return result;
    } finally {
      stopped = true;
      if (timer) clearTimeout(timer);
      await this.releaseLock(key, lockValue);
    }
  }
}
