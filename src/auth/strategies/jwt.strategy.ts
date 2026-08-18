// src/auth/strategies/jwt.strategy.ts
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configSv: ConfigService) {
    super({
      // Lấy token từ header Authorization
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configSv.get<string>('JWT_SECRET_KEY')!,
    });
  }

  // Hàm này tự động chạy SAU KHI token đã được giải mã hợp lệ
  validate(payload: { sub: number; email: string; scopes: string[] }) {
    // console.log('Extracted token:', payload);
    // Dữ liệu trả về ở đây sẽ được NestJS tự động gán vào đối tượng `req.user`
    return {
      userId: payload.sub,
      email: payload.email,
      scopes: payload.scopes,
    };
  }
}
