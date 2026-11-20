import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';
export const REDIS_SERVICE = 'REDIS_SERVICE';

export interface IRedisService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  mget(keys: string[]): Promise<Array<string | null>>;

  sadd(key: string, value: string, ttlSeconds: number): Promise<void>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, value: string): Promise<void>;

  hset(
    key: string,
    obj: Record<string, string>,
    ttlSeconds: number,
  ): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hincrby(key: string, field: string, delta: number): Promise<number>;
  hsetIfAbsent(
    key: string,
    obj: Record<string, string>,
    ttlSeconds: number,
  ): Promise<void>;

  zadd(
    key: string,
    entries: Array<{ score: number; member: string }>,
    ttlSeconds: number,
  ): Promise<void>;
  zrangeByScore(
    key: string,
    min: string | number,
    max: string | number,
    limit: number,
  ): Promise<string[]>;
  zcard(key: string): Promise<number>;
  zincrby(
    key: string,
    delta: number,
    member: string,
    ttlSeconds: number,
  ): Promise<number>;
  zaddMax(
    key: string,
    score: number,
    member: string,
    ttlSeconds: number,
  ): Promise<void>;
  zrevrangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<Array<{ member: string; score: number }>>;
}

@Injectable()
export class RedisService implements IRedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  async get(key: string): Promise<string | null> {
    return this.redisClient.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redisClient.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redisClient.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redisClient.del(key);
  }

  async mget(keys: string[]): Promise<Array<string | null>> {
    return this.redisClient.mget(...keys);
  }

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

  async hset(
    key: string,
    obj: Record<string, string>,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redisClient.hset(key, obj);
    await this.redisClient.expire(key, ttlSeconds);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redisClient.hgetall(key);
  }

  async hincrby(key: string, field: string, delta: number): Promise<number> {
    return Number(await this.redisClient.hincrby(key, field, delta));
  }

  async hsetIfAbsent(
    key: string,
    obj: Record<string, string>,
    ttlSeconds: number,
  ): Promise<void> {
    const [firstField, firstValue] = Object.entries(obj)[0];
    if (!firstField) return;

    const added = await this.redisClient.hsetnx(key, firstField, firstValue);
    if (added) await this.hset(key, obj, ttlSeconds);
  }

  async zadd(
    key: string,
    entries: Array<{ score: number; member: string }>,
    ttlSeconds: number,
  ): Promise<void> {
    if (entries.length === 0) return;

    const args = entries.flatMap(entry => [entry.score, entry.member]);
    await this.redisClient
      .multi()
      .zadd(key, ...args)
      .expire(key, ttlSeconds)
      .exec();
  }

  async zrangeByScore(
    key: string,
    min: string | number,
    max: string | number,
    limit: number,
  ): Promise<string[]> {
    return this.redisClient.zrangebyscore(key, min, max, 'LIMIT', 0, limit);
  }

  async zcard(key: string): Promise<number> {
    return this.redisClient.zcard(key);
  }

  async zincrby(
    key: string,
    delta: number,
    member: string,
    ttlSeconds: number,
  ): Promise<number> {
    const score = await this.redisClient.zincrby(key, delta, member);
    await this.redisClient.expire(key, ttlSeconds);
    return Number(score);
  }

  async zaddMax(
    key: string,
    score: number,
    member: string,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redisClient.zadd(key, 'GT', score, member);
    await this.redisClient.expire(key, ttlSeconds);
  }

  async zrevrangeWithScores(
    key: string,
    start: number,
    stop: number,
  ): Promise<Array<{ member: string; score: number }>> {
    const rows = await this.redisClient.zrevrange(
      key,
      start,
      stop,
      'WITHSCORES',
    );
    const result: Array<{ member: string; score: number }> = [];
    for (let i = 0; i < rows.length; i += 2) {
      result.push({ member: rows[i], score: Number(rows[i + 1]) });
    }
    return result;
  }
}
