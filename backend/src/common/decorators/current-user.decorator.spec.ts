import { ExecutionContext } from '@nestjs/common';

import { CurrentUser } from './current-user.decorator';

const ROUTE_ARGS_METADATA = '__routeArguments__';

interface ParamMetadata {
  index: number;
  data: unknown;
  factory: (data: unknown, ctx: ExecutionContext) => unknown;
}

class TestController {
  profile(@CurrentUser() currentUser: unknown): unknown {
    return currentUser;
  }

  other(@CurrentUser() currentUser: unknown): unknown {
    return currentUser;
  }
}

describe('CurrentUser decorator', () => {
  const getFactory = (method: keyof TestController) => {
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      TestController,
      method,
    ) as Record<string, ParamMetadata>;

    expect(metadata).toBeDefined();
    return Object.values(metadata)[0].factory;
  };

  const makeContext = (request: unknown) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  it('trả về request.user do guard/passport gán', () => {
    const user = { id: 'u1', email: 'user@example.com', roles: ['USER'] };

    expect(getFactory('profile')(undefined, makeContext({ user }))).toBe(user);
  });

  it('chưa xác thực (không có user) → trả undefined', () => {
    expect(
      getFactory('profile')(undefined, makeContext({ headers: {} })),
    ).toBeUndefined();
  });

  it('bỏ qua tham số data truyền vào decorator', () => {
    const user = { id: 'u1' };

    expect(getFactory('profile')('ignored', makeContext({ user }))).toBe(user);
  });

  it('lấy đúng request qua switchToHttp().getRequest()', () => {
    const getRequest = jest.fn().mockReturnValue({ user: { id: 'u2' } });
    const context = {
      switchToHttp: () => ({ getRequest }),
    } as unknown as ExecutionContext;

    expect(getFactory('profile')(undefined, context)).toEqual({ id: 'u2' });
    expect(getRequest).toHaveBeenCalledTimes(1);
  });

  it('mỗi handler có metadata param độc lập, cùng factory', () => {
    const profileFactory = getFactory('profile');
    const otherFactory = getFactory('other');

    expect(profileFactory).toBe(otherFactory);
    expect(getFactory('profile')(undefined, makeContext({ user: 'a' }))).toBe(
      'a',
    );
    expect(getFactory('other')(undefined, makeContext({ user: 'b' }))).toBe(
      'b',
    );
  });
});
