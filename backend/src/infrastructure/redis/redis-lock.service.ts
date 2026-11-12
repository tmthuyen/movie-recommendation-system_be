import { AppException } from '@/common/custom-exception/app-exception';
import { RedisService } from '@/infrastructure/redis/redis.service';
import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export const REDIS_LOCK_SERVICE = 'REDIS_LOCK_SERVICE';

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
}

@Injectable()
export class RedisLockService implements IRedisLockService {
  private readonly logger = new Logger(RedisLockService.name);
  constructor(private readonly redisService: RedisService) {}

  async acquireLock(key: string, ttlSeconds: number): Promise<string | null> {
    const lockValue = crypto.randomUUID();

    const result = await this.redisService.acquireLock(
      key,
      lockValue,
      ttlSeconds,
    );

    return result === 'OK' ? lockValue : null;
  }

  async releaseLock(key: string, lockValue: string): Promise<void> {
    const script = `
        if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
        else
            return 0
        end
      `;
    await this.redisService.eval(script, 1, key, lockValue);
  }

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
    const res = await this.redisService.eval(
      script,
      1,
      key,
      lockValue,
      ttlSeconds,
    );

    return Number(res) === 1;
  }

  async runWithLock<T>(
    key: string,
    ttlSeconds: number,
    callback: () => Promise<T>,
  ): Promise<T> {
    const lockValue = await this.acquireLock(key, ttlSeconds);

    if (!lockValue) {
      throw new AppException(
        423,
        'Resource is locked',
        `Could not acquire lock for key: ${key}`,
        'LOCK_ACQUISITION_FAILED',
      );
    }

    const renewIntervalMs = (ttlSeconds * 1000) / 3;

    let stopped = false;
    let lostLock = false;
    let timer: NodeJS.Timeout | undefined;

    const scheduleWatchdog = () => {
      timer = setTimeout(() => {
        void watchdog();
      }, renewIntervalMs);
    };

    const watchdog = async (): Promise<void> => {
      if (stopped || lostLock) return;

      try {
        const renewed = await this.extendLock(key, lockValue, ttlSeconds);

        if (!renewed) {
          lostLock = true;
          this.logger.error(`Lock ownership lost: ${key}`);
          return;
        }
      } catch (error) {
        lostLock = true;
        this.logger.error(`Failed to renew lock: ${key}`, error);
        return;
      }

      if (!stopped && !lostLock) {
        scheduleWatchdog();
      }
    };

    scheduleWatchdog();

    try {
      const result = await callback();

      if (lostLock) {
        throw new Error(`Lock ownership lost: ${key}`);
      }

      return result;
    } finally {
      stopped = true;

      if (timer) {
        clearTimeout(timer);
      }

      await this.releaseLock(key, lockValue);
    }
  }
}
