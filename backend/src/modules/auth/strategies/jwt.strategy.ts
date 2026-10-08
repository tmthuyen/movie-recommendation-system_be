import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';
import { RedisService } from '@/infrastructure/redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  constructor(
    private readonly configSv: ConfigService,
    private readonly redisService: RedisService,
  ) {
    super({
      // Lấy token từ header Authorization
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configSv.get<string>('ACCESS_SECRET_KEY')!,
    });
  }

  // Hàm này tự động chạy SAU KHI token đã được giải mã hợp lệ
  async validate(payload: JwtPayload) {
    // check jti in redis blacklist
    this.logger.log(`[JWT] Validating token with jti: ${payload.jti}`);
    const isBlacklisted = await this.redisService.get(
      `auth:blacklist:${payload.jti}`,
    );
    if (isBlacklisted) {
      throw new UnauthorizedException('Token không hợp lệ.');
    }

    // check sessionId in redis
    this.logger.log(`[JWT] Validating sessionId: ${payload.sessionId}`);
    const sessionData = await this.redisService.get(
      `auth:session:${payload.sessionId}`,
    );
    if (!sessionData) {
      throw new UnauthorizedException('Token không hợp lệ.');
    }

    return payload;
  }
}
