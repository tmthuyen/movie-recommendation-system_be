import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

  getClient(): Redis {
    return this.redisClient;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redisClient.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  async delByPattern(pattern: string): Promise<void> {
    const keys = await this.redisClient.keys(pattern);
    if (keys.length > 0) {
      await this.redisClient.del(...keys);
    }
  }

  async getKeys(pattern: string): Promise<string[]> {
    return this.redisClient.keys(pattern);
  }

  // Set
  async sadd(key: string, value: string, ttlSeconds: number): Promise<void> {
    await this.redisClient.sadd(key, value);
    await this.redisClient.expire(key, ttlSeconds);
  }

  async smembers(key: string): Promise<string[]> {
    return this.redisClient.smembers(key);
  }

  async srem(key: string, value: string): Promise<void> {
    await this.redisClient.srem(key, value);
  }

  // hash
  async hset(
    key: string,
    obj: Record<string, string>,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redisClient.hset(key, obj);
    await this.redisClient.expire(key, ttlSeconds);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.redisClient.hget(key, field);
  }

  async hdel(key: string, field: string): Promise<void> {
    await this.redisClient.hdel(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redisClient.hgetall(key);
  }

  // list
  async lpush(key: string, value: string): Promise<void> {
    await this.redisClient.lpush(key, value);
  }

  async rpush(key: string, value: string): Promise<void> {
    await this.redisClient.rpush(key, value);
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    return this.redisClient.lrange(key, start, stop);
  }

  async lrem(key: string, count: number, value: string): Promise<void> {
    await this.redisClient.lrem(key, count, value);
  }

  async lpop(key: string): Promise<string | null> {
    return this.redisClient.lpop(key);
  }

  onModuleDestroy() {
    this.redisClient.disconnect();
  }
}
