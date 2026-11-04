import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';
import { RATE_LIMIT_KEY } from './rate-limit.decorator';
import { RateLimitOptions } from './rate-limit.interface';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let rateLimitService: {
    checkFixedWindow: jest.Mock;
    checkSlidingWindow: jest.Mock;
    checkTokenBucket: jest.Mock;
  };

  const handler = function handler() {};
  const controllerClass = class TestController {};

  const makeContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => handler,
      getClass: () => controllerClass,
    }) as unknown as ExecutionContext;

  const decorate = (options: RateLimitOptions | undefined) =>
    reflector.getAllAndOverride.mockReturnValue(options);

  const expectTooManyRequests = async (
    context: ExecutionContext,
    message: string,
  ) => {
    const error = await guard.canActivate(context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(
      HttpStatus.TOO_MANY_REQUESTS,
    );
    expect((error as HttpException).message).toBe(message);
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    rateLimitService = {
      checkFixedWindow: jest.fn().mockResolvedValue(true),
      checkSlidingWindow: jest.fn().mockResolvedValue(true),
      checkTokenBucket: jest.fn().mockResolvedValue(true),
    };

    guard = new RateLimitGuard(
      reflector as unknown as Reflector,
      rateLimitService as unknown as RateLimitService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('không có decorator (global limit)', () => {
    it('áp dụng mặc định 100 req/60s theo IP và key có hậu tố :global', async () => {
      decorate(undefined);
      const context = makeContext({ ip: '10.0.0.1', path: '/api/movies' });

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(RATE_LIMIT_KEY, [
        handler,
        controllerClass,
      ]);
      expect(rateLimitService.checkFixedWindow).toHaveBeenCalledWith(
        'rl:fixed-window:ip:10.0.0.1:global',
        100,
        60000,
      );
    });

    it('chưa đăng nhập và không có IP → dùng "unknown"/"guest"', async () => {
      decorate(undefined);
      const context = makeContext({ path: '/api/movies' });

      await guard.canActivate(context);

      expect(rateLimitService.checkFixedWindow).toHaveBeenCalledWith(
        'rl:fixed-window:ip:unknown:global',
        100,
        60000,
      );
    });
  });

  describe('decorator theo IP / user', () => {
    it('type=ip → key theo IP kèm route path của handler', async () => {
      decorate({
        strategy: 'fixed-window',
        type: 'ip',
        limit: 5,
        windowMs: 1000,
      });
      const context = makeContext({ ip: '10.0.0.2', path: '/api/auth/login' });

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(rateLimitService.checkFixedWindow).toHaveBeenCalledWith(
        'rl:fixed-window:ip:10.0.0.2:route:/api/auth/login',
        5,
        1000,
      );
    });

    it('type=user → key theo user.sub, dưới hạn mức thì cho qua', async () => {
      decorate({
        strategy: 'fixed-window',
        type: 'user',
        limit: 20,
        windowMs: 60000,
      });
      const context = makeContext({
        ip: '10.0.0.3',
        path: '/api/users/me',
        user: { sub: 123 },
      });

      await expect(guard.canActivate(context)).resolves.toBe(true);

      expect(rateLimitService.checkFixedWindow).toHaveBeenCalledWith(
        'rl:fixed-window:usr:123:route:/api/users/me',
        20,
        60000,
      );
    });

    it('type=ip-and-user → key chứa cả IP và user', async () => {
      decorate({
        strategy: 'fixed-window',
        type: 'ip-and-user',
        limit: 10,
        windowMs: 30000,
      });
      const context = makeContext({
        ip: '10.0.0.4',
        path: '/api/movies/1',
        user: { sub: 'user-9' },
      });

      await guard.canActivate(context);

      expect(rateLimitService.checkFixedWindow).toHaveBeenCalledWith(
        'rl:fixed-window:ip:10.0.0.4:usr:user-9:route:/api/movies/1',
        10,
        30000,
      );
    });
  });

  describe('theo strategy', () => {
    it('sliding-window → gọi checkSlidingWindow với cùng key/limit/window', async () => {
      decorate({
        strategy: 'sliding-window',
        type: 'ip',
        limit: 3,
        windowMs: 5000,
      });
      const context = makeContext({ ip: '10.0.0.5', path: '/api/ratings' });

      await guard.canActivate(context);

      expect(rateLimitService.checkSlidingWindow).toHaveBeenCalledWith(
        'rl:sliding-window:ip:10.0.0.5:route:/api/ratings',
        3,
        5000,
      );
      expect(rateLimitService.checkFixedWindow).not.toHaveBeenCalled();
    });

    it('token-bucket → gọi checkTokenBucket', async () => {
      decorate({
        strategy: 'token-bucket',
        type: 'ip',
        limit: 8,
        windowMs: 2000,
      });
      const context = makeContext({ ip: '10.0.0.6', path: '/api/comments' });

      await guard.canActivate(context);

      expect(rateLimitService.checkTokenBucket).toHaveBeenCalledWith(
        'rl:token-bucket:ip:10.0.0.6:route:/api/comments',
        8,
        2000,
      );
    });
  });

  describe('vượt hạn mức', () => {
    it('bị chặn → HttpException 429 với message mặc định', async () => {
      decorate({
        strategy: 'fixed-window',
        type: 'ip',
        limit: 1,
        windowMs: 1000,
      });
      rateLimitService.checkFixedWindow.mockResolvedValue(false);
      const context = makeContext({ ip: '10.0.0.7', path: '/api/movies' });

      await expectTooManyRequests(
        context,
        'Quá nhiều request, vui lòng thử lại sau',
      );
    });

    it('bị chặn → dùng errorMessage tuỳ biến của decorator', async () => {
      decorate({
        strategy: 'fixed-window',
        type: 'ip',
        limit: 1,
        windowMs: 1000,
        errorMessage: 'Bạn thao tác quá nhanh',
      });
      rateLimitService.checkFixedWindow.mockResolvedValue(false);
      const context = makeContext({ ip: '10.0.0.8', path: '/api/auth/login' });

      await expectTooManyRequests(context, 'Bạn thao tác quá nhanh');
    });

    it('sliding-window vượt hạn mức cũng bị chặn 429', async () => {
      decorate({
        strategy: 'sliding-window',
        type: 'user',
        limit: 2,
        windowMs: 1000,
      });
      rateLimitService.checkSlidingWindow.mockResolvedValue(false);
      const context = makeContext({
        ip: '10.0.0.9',
        path: '/api/ratings',
        user: { sub: 'u-1' },
      });

      await expectTooManyRequests(
        context,
        'Quá nhiều request, vui lòng thử lại sau',
      );
    });
  });

  describe('lỗi hạ tầng', () => {
    it('RateLimitService ném lỗi (Redis down) → lỗi lan truyền cho caller', async () => {
      decorate({
        strategy: 'fixed-window',
        type: 'ip',
        limit: 1,
        windowMs: 1000,
      });
      rateLimitService.checkFixedWindow.mockRejectedValue(
        new Error('redis unavailable'),
      );
      const context = makeContext({ ip: '10.0.0.10', path: '/api/movies' });

      await expect(guard.canActivate(context)).rejects.toThrow(
        'redis unavailable',
      );
    });
  });
});
