import { Injectable } from '@nestjs/common';
import { RedisService } from '@/infrastructure/redis/redis.service';
import * as crypto from 'crypto';

export interface SessionData {
  userId: string;
  refreshToken: string;
  deviceId: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  jti?: string;
}

@Injectable()
export class SessionService {
  constructor(private readonly redisService: RedisService) {}

  private getSessionKey(userId: string, deviceId: string): string {
    return `session:${userId}:${deviceId}`;
  }

  generateOpaqueToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  generateRefreshToken(userId: string): string {
    return `${userId}.${crypto.randomBytes(40).toString('hex')}`;
  }

  async createSession(
    userId: string,
    ip: string,
    userAgent: string,
    deviceId?: string,
    jti?: string,
  ): Promise<SessionData> {
    const dId = deviceId || crypto.randomUUID();
    const refreshToken = this.generateRefreshToken(userId);
    const ttlSeconds = 30 * 24 * 60 * 60; // 30 days
    const now = Date.now();

    const session: SessionData = {
      userId,
      refreshToken,
      deviceId: dId,
      ip,
      userAgent,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      lastActivityAt: now,
      jti,
    };

    await this.redisService.set(
      this.getSessionKey(userId, dId),
      JSON.stringify(session),
      ttlSeconds,
    );
    return session;
  }

  async getSession(
    userId: string,
    deviceId: string,
  ): Promise<SessionData | null> {
    const data = await this.redisService.get(
      this.getSessionKey(userId, deviceId),
    );
    if (!data) return null;
    return JSON.parse(data) as SessionData;
  }

  async updateLastActivity(
    userId: string,
    deviceId: string,
    sessionData: SessionData,
  ): Promise<void> {
    sessionData.lastActivityAt = Date.now();
    const remainingTtl = Math.floor(
      (sessionData.expiresAt - Date.now()) / 1000,
    );
    if (remainingTtl > 0) {
      await this.redisService.set(
        this.getSessionKey(userId, deviceId),
        JSON.stringify(sessionData),
        remainingTtl,
      );
    }
  }

  async removeSession(userId: string, deviceId: string): Promise<void> {
    const session = await this.getSession(userId, deviceId);
    if (session && session.jti) {
      await this.redisService.set(`blacklist:${session.jti}`, 'true', 3600); // Blacklist for 1h
    }
    await this.redisService.del(this.getSessionKey(userId, deviceId));
  }

  async removeAllSessions(userId: string): Promise<void> {
    const keys = await this.redisService.getKeys(`session:${userId}:*`);
    for (const key of keys) {
      const data = await this.redisService.get(key);
      if (data) {
        const session = JSON.parse(data) as SessionData;
        if (session.jti) {
          await this.redisService.set(`blacklist:${session.jti}`, 'true', 3600); // Blacklist for 1h
        }
      }
    }
    await this.redisService.delByPattern(`session:${userId}:*`);
  }
}
