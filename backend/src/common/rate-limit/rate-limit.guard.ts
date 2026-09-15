import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';
import { RateLimitOptions } from './rate-limit.interface';
import { RateLimitService } from './rate-limit.service';
import type { Request } from 'express';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    
    const specificOptions = this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Nếu không có decorator, áp dụng Global Limit mặc định
    const options: RateLimitOptions = specificOptions || {
      strategy: 'fixed-window',
      type: 'ip',
      limit: 100,
      windowMs: 60000, 
    };

    const clientIp = request.ip || 'unknown';
    const user = request.user as JwtPayload | undefined;
    const userId = user?.sub ? String(user.sub) : 'guest';

    let key = `rl:${options.strategy}`;
    
    if (options.type === 'user') {
      key += `:usr:${userId}`;
    } else if (options.type === 'ip-and-user') {
      key += `:ip:${clientIp}:usr:${userId}`;
    } else {
      key += `:ip:${clientIp}`;
    }

    if (specificOptions) {
      key += `:route:${request.path}`;
    } else {
      key += `:global`;
    }

    let isAllowed = false;
    switch (options.strategy) {
      case 'fixed-window':
        isAllowed = await this.rateLimitService.checkFixedWindow(key, options.limit, options.windowMs);
        break;
      case 'sliding-window':
        isAllowed = await this.rateLimitService.checkSlidingWindow(key, options.limit, options.windowMs);
        break;
      case 'token-bucket':
        isAllowed = await this.rateLimitService.checkTokenBucket(key, options.limit, options.windowMs);
        break;
    }

    if (!isAllowed) {
      throw new HttpException(
        options.errorMessage || 'Quá nhiều request, vui lòng thử lại sau',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
