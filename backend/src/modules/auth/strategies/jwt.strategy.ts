import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';
import { RedisService } from '@/modules/redis/redis.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
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
    if (payload.jti) {
      const isBlacklisted = await this.redisService.get(
        `blacklist:${payload.jti}`,
      );
      if (isBlacklisted) {
        throw new UnauthorizedException('Token đã bị thu hồi (đăng xuất)');
      }
    }

    return {
      userId: payload.sub,
      fullName: payload.fullName,
      email: payload.email,
      scopes: payload.scopes,
    };
  }
}
