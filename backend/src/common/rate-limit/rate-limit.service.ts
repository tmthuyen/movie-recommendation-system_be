import { Injectable } from '@nestjs/common';
import { RedisService } from '@/infrastructure/redis/redis.service';
import Redis from 'ioredis';

@Injectable()
export class RateLimitService {
  private redis: Redis;

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getClient();
  }

  async checkFixedWindow(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    const current = await this.redis.incr(key);
    if (current === 1) {
      await this.redis.pexpire(key, windowMs);
    }
    return current <= limit;
  }

  async checkSlidingWindow(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    const now = Date.now();
    const windowStart = now - windowMs;

    const pipeline = this.redis.pipeline();
    // Xóa các request cũ ngoài cửa sổ
    pipeline.zremrangebyscore(key, 0, windowStart);
    // Thêm request hiện tại vào sorted set
    pipeline.zadd(key, now, `${now}-${Math.random()}`);
    // Đếm số lượng request còn trong cửa sổ
    pipeline.zcard(key);
    // Cập nhật TTL cho key để tự động xóa khi không dùng
    pipeline.pexpire(key, windowMs);

    const results = await pipeline.exec();
    if (!results) return false;

    // results[2][1] chứa kết quả của lệnh zcard
    const requestCount = results[2][1] as number;
    return requestCount <= limit;
  }

  async checkTokenBucket(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    // Lua script đảm bảo tính nguyên tử (atomic) cho thuật toán Token Bucket
    const luaScript = `
      local tokens_key = KEYS[1]
      local timestamp_key = KEYS[2]
      local rate = tonumber(ARGV[1])
      local capacity = tonumber(ARGV[2])
      local now = tonumber(ARGV[3])
      local requested = tonumber(ARGV[4])
      local ttl = tonumber(ARGV[5])

      local last_tokens = tonumber(redis.call("get", tokens_key))
      if last_tokens == nil then
        last_tokens = capacity
      end

      local last_refreshed = tonumber(redis.call("get", timestamp_key))
      if last_refreshed == nil then
        last_refreshed = 0
      end

      local delta = math.max(0, now - last_refreshed)
      local filled_tokens = math.min(capacity, last_tokens + (delta * rate))
      local allowed = filled_tokens >= requested
      
      local new_tokens = filled_tokens
      if allowed then
        new_tokens = filled_tokens - requested
      end

      redis.call("setex", tokens_key, ttl, new_tokens)
      redis.call("setex", timestamp_key, ttl, now)

      return allowed and 1 or 0
    `;

    // rate = số lượng token nạp mỗi milisecond
    const rate = limit / windowMs;
    const now = Date.now();
    // TTL lưu trong redis tính bằng giây, cần ít nhất 1s để duy trì key
    const ttlSeconds = Math.ceil(windowMs / 1000) * 2;

    const result = await this.redis.eval(
      luaScript,
      2,
      `${key}:tokens`,
      `${key}:ts`,
      rate,
      limit,
      now,
      1,
      ttlSeconds,
    );

    return result === 1;
  }
}
