import { AppException } from '@/common/custom-exception/app-exception';
import type { CursorPagination } from '@/common/dtos/paginated-result.interface';
import { HttpStatus } from '@nestjs/common';
import { createHash } from 'crypto';
import { z } from 'zod';

/**
 * Cursor pagination dùng chung cho similar/hybrid/semantic:
 * source tạo snapshot + `version` + `fingerprint`, sau đó dùng
 * `resolveCursorOffset` → `hydrateCursorPage` → `buildCursorPagination`.
 *
 * Payload bên trong cursor opaque:
 * - `v`: version snapshot nguồn (counter/cache version).
 * - `s`: scope ổn định của danh sách (`similar:1`, `semantic:<hash>`...).
 * - `o`: offset của item kế tiếp.
 * - `f`: fingerprint của ordered id list tại thời điểm phát cursor.
 */
export interface CursorPayload {
  v: number;
  s: string;
  o: number;
  f: string;
}

const CursorPayloadSchema = z.strictObject({
  v: z.number().int().nonnegative(),
  s: z.string().min(1).max(200),
  o: z.number().int().nonnegative(),
  f: z.string().min(1).max(64),
});

export interface CursorContext {
  version: number;
  scope: string;
  fingerprint: string;
}

export interface CursorPaginationInput extends CursorContext {
  limit: number;
  total: number;
  /** Offset kế tiếp sau trang vừa trả. */
  offset: number;
}

export interface HydrateCursorPageOptions<TItem, TResult> {
  items: TItem[];
  offset: number;
  limit: number;
  /** Hydrate một chunk item; item nào không còn tồn tại thì bỏ qua. */
  hydrate: (items: TItem[]) => Promise<TResult[]>;
}

export interface HydratedCursorPage<TResult> {
  result: TResult[];
  nextOffset: number;
  hasMore: boolean;
}

function invalidCursor(message: string): AppException {
  return new AppException(
    HttpStatus.BAD_REQUEST,
    message,
    'The cursor is invalid or malformed.',
    'INVALID_CURSOR',
  );
}

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor(cursor: string): CursorPayload {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    return CursorPayloadSchema.parse(JSON.parse(raw));
  } catch {
    throw invalidCursor('Cursor không hợp lệ.');
  }
}

/**
 * Tạo scope ổn định cho cursor, ví dụ `similar:1` hoặc `hybrid:user:42`.
 * Với query dài (semantic/hybrid), hash query trước khi truyền vào đây.
 */
export function buildCursorScope(...parts: Array<string | number>): string {
  return parts.join(':');
}

/** Hash ổn định theo đúng thứ tự id, dùng để phát hiện snapshot đổi. */
export function fingerprintIds(ids: Array<number | string>): string {
  return createHash('sha1')
    .update(JSON.stringify(ids))
    .digest('hex')
    .slice(0, 16);
}

export function clampCursorLimit(
  limit: number | undefined,
  fallback: number,
  max: number,
): number {
  const parsed = Number(limit);
  if (!Number.isFinite(parsed) || parsed < 1) return Math.min(fallback, max);
  return Math.min(Math.floor(parsed), max);
}

/**
 * Validate cursor và trả offset.
 *
 * - Cursor hỏng/sai scope/offset vượt danh sách → `400 INVALID_CURSOR`.
 * - Version hoặc fingerprint không khớp snapshot hiện tại → `409 CURSOR_EXPIRED`.
 */
export function resolveCursorOffset(
  cursor: string | undefined,
  context: CursorContext,
  itemCount: number,
): number {
  if (!cursor) return 0;

  const payload = decodeCursor(cursor);

  if (payload.s !== context.scope) {
    throw invalidCursor('Cursor không thuộc danh sách này.');
  }

  // Kiểm tra snapshot trước offset để cursor cũ (list đã đổi/ngắn hơn)
  // trả 409 cho frontend reset, thay vì 400 khó phân biệt.
  if (payload.v !== context.version || payload.f !== context.fingerprint) {
    throw new AppException(
      HttpStatus.CONFLICT,
      'Cursor đã hết hạn vì danh sách gợi ý đã thay đổi.',
      'The cursor has expired because the recommendation snapshot changed.',
      'CURSOR_EXPIRED',
    );
  }

  if (payload.o > itemCount) {
    throw invalidCursor('Vị trí cursor không hợp lệ.');
  }

  return payload.o;
}

/**
 * Cắt snapshot theo cursor và hydrate theo chunk.
 *
 * Nếu một số item không còn trong DB, tiếp tục lấy chunk sau để cố fill đủ
 * `limit`; nhờ vậy page không bị ngắn bất thường chỉ vì dữ liệu thay đổi.
 */
export async function hydrateCursorPage<TItem, TResult>(
  options: HydrateCursorPageOptions<TItem, TResult>,
): Promise<HydratedCursorPage<TResult>> {
  const { items, offset, limit, hydrate } = options;
  const result: TResult[] = [];
  let nextOffset = offset;

  while (result.length < limit && nextOffset < items.length) {
    const chunk = items.slice(nextOffset, nextOffset + (limit - result.length));
    nextOffset += chunk.length;

    const hydrated = await hydrate(chunk);
    result.push(...hydrated);
  }

  return {
    result,
    nextOffset,
    hasMore: nextOffset < items.length,
  };
}

export function buildCursorPagination(
  input: CursorPaginationInput,
): CursorPagination {
  const { limit, total, offset, version, scope, fingerprint } = input;
  const hasMore = offset < total;

  return {
    limit,
    total,
    hasMore,
    nextCursor: hasMore
      ? encodeCursor({ v: version, s: scope, o: offset, f: fingerprint })
      : null,
  };
}
