import { AppException } from '@/common/custom-exception/app-exception';
import { HttpStatus } from '@nestjs/common';
import {
  buildCursorPagination,
  buildCursorScope,
  clampCursorLimit,
  decodeCursor,
  encodeCursor,
  fingerprintIds,
  hydrateCursorPage,
  resolveCursorOffset,
} from './cursor-pagination.util';

describe('cursor-pagination.util', () => {
  const context = {
    version: 2,
    scope: 'similar:1',
    fingerprint: fingerprintIds([10, 20, 30]),
  };

  const expectAppError = (
    fn: () => unknown,
    statusCode: HttpStatus,
    errorCode: string,
  ) => {
    try {
      fn();
    } catch (error) {
      expect(error).toMatchObject({ statusCode, errorCode });
      return;
    }
    throw new Error('Expected AppException');
  };

  it('encode/decode round-trip payload', () => {
    const payload = { v: 2, s: 'similar:1', o: 12, f: 'abc' };

    const decoded = decodeCursor(encodeCursor(payload));

    expect(decoded).toEqual(payload);
  });

  it('cursor base64 sai → 400 INVALID_CURSOR', () => {
    expect(() => decodeCursor('not-a-cursor')).toThrow(AppException);

    try {
      decodeCursor('not-a-cursor');
    } catch (error) {
      expect(error).toMatchObject({
        statusCode: HttpStatus.BAD_REQUEST,
        errorCode: 'INVALID_CURSOR',
      });
    }
  });

  it('JSON/schema sai → 400 INVALID_CURSOR', () => {
    const raw = Buffer.from(JSON.stringify({ v: 1, s: '', o: -1 })).toString(
      'base64url',
    );

    expect(() => decodeCursor(raw)).toThrow(AppException);
  });

  it('fingerprint ổn định và phụ thuộc thứ tự id', () => {
    expect(fingerprintIds([1, 2, 3])).toBe(fingerprintIds([1, 2, 3]));
    expect(fingerprintIds([1, 2, 3])).not.toBe(fingerprintIds([3, 2, 1]));
  });

  it('buildCursorScope nối các phần bằng dấu hai chấm', () => {
    expect(buildCursorScope('similar', 1)).toBe('similar:1');
    expect(buildCursorScope('hybrid', 'user', 42)).toBe('hybrid:user:42');
  });

  it('không có cursor → offset 0', () => {
    expect(resolveCursorOffset(undefined, context, 100)).toBe(0);
    expect(resolveCursorOffset('', context, 100)).toBe(0);
  });

  it('cursor đúng → trả offset', () => {
    const cursor = encodeCursor({
      v: context.version,
      s: context.scope,
      o: 12,
      f: context.fingerprint,
    });

    expect(resolveCursorOffset(cursor, context, 100)).toBe(12);
  });

  it('sai scope hoặc offset vượt danh sách → 400 INVALID_CURSOR', () => {
    const wrongScope = encodeCursor({
      v: context.version,
      s: 'similar:2',
      o: 12,
      f: context.fingerprint,
    });
    const wrongOffset = encodeCursor({
      v: context.version,
      s: context.scope,
      o: 101,
      f: context.fingerprint,
    });

    expectAppError(
      () => resolveCursorOffset(wrongScope, context, 100),
      HttpStatus.BAD_REQUEST,
      'INVALID_CURSOR',
    );
    expectAppError(
      () => resolveCursorOffset(wrongOffset, context, 100),
      HttpStatus.BAD_REQUEST,
      'INVALID_CURSOR',
    );
  });

  it('version/fingerprint khác → 409 CURSOR_EXPIRED', () => {
    const oldVersion = encodeCursor({
      v: context.version - 1,
      s: context.scope,
      o: 12,
      f: context.fingerprint,
    });
    const oldFingerprint = encodeCursor({
      v: context.version,
      s: context.scope,
      o: 12,
      f: 'old-fingerprint',
    });

    expectAppError(
      () => resolveCursorOffset(oldVersion, context, 100),
      HttpStatus.CONFLICT,
      'CURSOR_EXPIRED',
    );
    expectAppError(
      () => resolveCursorOffset(oldFingerprint, context, 100),
      HttpStatus.CONFLICT,
      'CURSOR_EXPIRED',
    );
  });

  it('hydrateCursorPage skip item missing và fill đủ limit', async () => {
    const items = [{ id: 1 }, { id: 999 }, { id: 2 }, { id: 3 }];
    const hydrate = jest.fn((chunk: { id: number }[]) =>
      Promise.resolve(chunk.filter(item => item.id !== 999)),
    );

    const page = await hydrateCursorPage({
      items,
      offset: 0,
      limit: 2,
      hydrate,
    });

    expect(page.result).toEqual([{ id: 1 }, { id: 2 }]);
    expect(page.nextOffset).toBe(3);
    expect(page.hasMore).toBe(true);
    expect(hydrate).toHaveBeenCalledTimes(2);
  });

  it('hydrateCursorPage trả trang rỗng khi offset = items.length', async () => {
    const page = await hydrateCursorPage({
      items: [{ id: 1 }],
      offset: 1,
      limit: 2,
      hydrate: jest.fn(),
    });

    expect(page).toEqual({ result: [], nextOffset: 1, hasMore: false });
  });

  it('buildCursorPagination tạo nextCursor khi còn dữ liệu', () => {
    const pagination = buildCursorPagination({
      limit: 10,
      total: 30,
      offset: 10,
      version: context.version,
      scope: context.scope,
      fingerprint: context.fingerprint,
    });

    expect(pagination).toMatchObject({
      limit: 10,
      total: 30,
      hasMore: true,
    });
    expect(pagination.nextCursor).not.toBeNull();
    expect(decodeCursor(pagination.nextCursor as string)).toEqual({
      v: context.version,
      s: context.scope,
      o: 10,
      f: context.fingerprint,
    });
  });

  it('buildCursorPagination trả nextCursor null ở trang cuối', () => {
    const pagination = buildCursorPagination({
      limit: 10,
      total: 20,
      offset: 20,
      version: context.version,
      scope: context.scope,
      fingerprint: context.fingerprint,
    });

    expect(pagination).toEqual({
      limit: 10,
      total: 20,
      hasMore: false,
      nextCursor: null,
    });
  });

  it('clampCursorLimit dùng fallback/max hợp lý', () => {
    expect(clampCursorLimit(undefined, 12, 50)).toBe(12);
    expect(clampCursorLimit(0, 12, 50)).toBe(12);
    expect(clampCursorLimit(10.9, 12, 50)).toBe(10);
    expect(clampCursorLimit(100, 12, 50)).toBe(50);
  });
});
