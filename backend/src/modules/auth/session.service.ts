import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@/infrastructure/redis/redis.service';
import * as crypto from 'crypto';

export type SessionData = {
  userId: string;
  refreshToken: string;
  deviceId: string;
  ip: string;
  userAgent: string;
  createdAt: number;
  expiresAt: number;
  lastActivityAt: number;
  sessionId: string;
  jti: string;
};

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  constructor(private readonly redisService: RedisService) {}

  private getSessionKey(sessionId: string): string {
    return `auth:session:${sessionId}`;
  }

  private getBlacklistKey(jti: string): string {
    return `auth:blacklist:${jti}`;
  }

  private getUserSessionsKey(userId: string): string {
    return `auth:user:${userId}:sessions`;
  }

  generateOpaqueToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  generateRefreshToken(sessionId: string): string {
    return `${sessionId}.${this.generateOpaqueToken()}`;
  }

  async createSession(
    userId: string,
    ip: string,
    userAgent: string,
    deviceId: string,
    sessionId: string,
    jti: string,
  ): Promise<SessionData> {
    const refreshToken = this.generateRefreshToken(sessionId);
    const ttlSeconds = 30 * 24 * 60 * 60; // 30 days
    const now = Date.now();

    const session: SessionData = {
      userId,
      refreshToken,
      deviceId,
      ip,
      userAgent,
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
      lastActivityAt: now,
      sessionId,
      jti,
    };

    // auth:session:<sessionId> -> SessionData
    await this.redisService.set(
      this.getSessionKey(sessionId),
      JSON.stringify(session),
      ttlSeconds,
    );

    // auth:user:<userId>:sessions -> Set of sessionIds
    await this.redisService.sadd(
      this.getUserSessionsKey(userId),
      sessionId,
      ttlSeconds,
    );
    return session;
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    const data = await this.redisService.get(this.getSessionKey(sessionId));
    if (!data) return null;
    return JSON.parse(data) as SessionData;
  }

  // async updateLastActivity(
  //   userId: string,
  //   deviceId: string,
  //   sessionData: SessionData,
  // ): Promise<void> {
  //   sessionData.lastActivityAt = Date.now();
  //   const remainingTtl = Math.floor(
  //     (sessionData.expiresAt - Date.now()) / 1000,
  //   );
  //   if (remainingTtl > 0) {
  //     await this.redisService.set(
  //       this.getSessionKey(userId, deviceId),
  //       JSON.stringify(sessionData),
  //       remainingTtl,
  //     );
  //   }
  // }

  async removeSession(sessionId: string): Promise<void> {
    const session = await this.getSession(sessionId);
    if (!session) {
      this.logger.warn(
        `[Session Remove] No session found for sessionId: ${sessionId}`,
      );
      return;
    }
    if (session && session.jti) {
      await this.redisService.set(
        this.getBlacklistKey(session.jti),
        'true',
        3600,
      ); // Blacklist for 1h
    }

    // Remove the session from Redis
    await this.redisService.del(this.getSessionKey(sessionId));
    this.logger.log(
      `[Session Removed] Session: ${this.getSessionKey(sessionId)} removed.`,
    );

    // Remove the sessionId from the user's session set
    this.logger.log(
      '[Before Sessions]' +
        JSON.stringify(
          await this.redisService.smembers(
            this.getUserSessionsKey(session.userId),
          ),
        ),
    );
    const userSessionsKey = this.getUserSessionsKey(session.userId);
    await this.redisService.srem(userSessionsKey, sessionId);
    this.logger.log(
      '[After Sessions]' +
        JSON.stringify(
          await this.redisService.smembers(
            this.getUserSessionsKey(session.userId),
          ),
        ),
    );

    this.logger.log(
      `[Session Removed] Session: ${this.getSessionKey(sessionId)} removed.`,
    );
  }

  // all sessions of a user
  async getAllSessionsForUser(userId: string): Promise<SessionData[]> {
    const sessionIds = await this.redisService.smembers(
      this.getUserSessionsKey(userId),
    );
    const sessions: SessionData[] = [];
    for (const sessionId of sessionIds) {
      const session = await this.getSession(sessionId);
      if (session) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  // Remove all sessions for a user
  async removeAllSessions(userId: string): Promise<void> {
    const userSessionsKey = this.getUserSessionsKey(userId);
    const sessionIds = await this.redisService.smembers(userSessionsKey);
    for (const sessionId of sessionIds) {
      await this.removeSession(sessionId);
    }
  }
}
