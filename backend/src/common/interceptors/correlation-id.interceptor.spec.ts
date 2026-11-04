import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { CorrelationIdInterceptor } from './correlation-id.interceptor';

jest.mock('uuid', () => ({
  v4: () => 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
}));

describe('CorrelationIdInterceptor', () => {
  let interceptor: CorrelationIdInterceptor;
  let next: CallHandler;

  const buildContext = (headers: Record<string, unknown>) => {
    const request: Record<string, any> = {
      headers,
      method: 'GET',
      originalUrl: '/api/movies',
    };
    return {
      request,
      context: {
        switchToHttp: () => ({ getRequest: () => request }),
      } as unknown as ExecutionContext,
    };
  };

  beforeEach(() => {
    interceptor = new CorrelationIdInterceptor();
    next = { handle: jest.fn().mockReturnValue(of('ok')) };
    jest
      .spyOn(interceptor['logger'], 'log')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('dùng header x-correlation-id nếu client gửi', done => {
    const { request, context } = buildContext({
      'x-correlation-id': 'client-id-123',
    });

    interceptor.intercept(context, next).subscribe(value => {
      expect(request.correlationId).toBe('client-id-123');
      expect(value).toBe('ok');
      done();
    });
  });

  it('header dạng mảng → lấy phần tử đầu', done => {
    const { request, context } = buildContext({
      'x-correlation-id': ['first-id', 'second-id'],
    });

    interceptor.intercept(context, next).subscribe(() => {
      expect(request.correlationId).toBe('first-id');
      done();
    });
  });

  it('không có header → sinh UUID', done => {
    const { request, context } = buildContext({});

    interceptor.intercept(context, next).subscribe(() => {
      expect(request.correlationId).toBe(
        'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      );
      done();
    });
  });

  it('log request và log thời lượng sau khi handler xong', done => {
    const { context } = buildContext({ 'x-correlation-id': 'abc' });

    interceptor.intercept(context, next).subscribe(() => {
      const messages = (interceptor['logger'].log as jest.Mock).mock.calls.map(
        call => call[0] as string,
      );
      expect(messages[0]).toContain('[abc] → GET /api/movies');
      expect(messages[1]).toMatch(/\[abc\] ← \d+ms/);
      done();
    });
  });
});
