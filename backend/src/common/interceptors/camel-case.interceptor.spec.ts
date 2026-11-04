import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { CamelCaseInterceptor } from './camel-case.interceptor';

describe('CamelCaseInterceptor', () => {
  let interceptor: CamelCaseInterceptor;
  let next: CallHandler;

  const buildContext = (request: Record<string, unknown>) =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    interceptor = new CamelCaseInterceptor();
    next = { handle: jest.fn().mockReturnValue(of({ ok: true })) };
  });

  const run = (ctx: ExecutionContext) =>
    interceptor.intercept(ctx, next) as Observable<unknown>;

  it('camel hoá key lồng nhau trong query', done => {
    const req: Record<string, any> = {
      query: { release_year_from: '2000', nested_obj: { inner_key: 1 } },
    };

    run(buildContext(req)).subscribe(() => {
      expect(req.query).toEqual({
        releaseYearFrom: '2000',
        nestedObj: { innerKey: 1 },
      });
      expect((next.handle as jest.Mock).mock.calls).toHaveLength(1);
      done();
    });
  });

  it('camel hoá key lồng nhau trong body, giữ nguyên mảng', done => {
    const req: Record<string, any> = {
      body: {
        movie_id: 1,
        genre_ids: [1, 2],
        movie_peoples: [{ people_id: 3, main_role: 'actor' }],
      },
    };

    run(buildContext(req)).subscribe(() => {
      expect(req.body).toEqual({
        movieId: 1,
        genreIds: [1, 2],
        moviePeoples: [{ peopleId: 3, mainRole: 'actor' }],
      });
      done();
    });
  });

  it('query rỗng → không thay đổi', done => {
    const req: Record<string, any> = { query: {} };

    run(buildContext(req)).subscribe(() => {
      expect(req.query).toEqual({});
      done();
    });
  });

  it('không có body/query → không crash', done => {
    const req: Record<string, any> = {};

    run(buildContext(req)).subscribe(() => {
      expect(req.query).toBeUndefined();
      expect(req.body).toBeUndefined();
      done();
    });
  });

  it('giữ nguyên primitive trong body', done => {
    const req: Record<string, any> = { body: { some_key: 'abc', n: 5 } };

    run(buildContext(req)).subscribe(() => {
      expect(req.body).toEqual({ someKey: 'abc', n: 5 });
      done();
    });
  });
});
