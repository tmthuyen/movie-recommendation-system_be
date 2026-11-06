import { AppException } from '@/common/custom-exception/app-exception';

export function toSafeNumberId(value: unknown): number {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new AppException(
      400,
      `Id không hợp lệ: ${String(value)}`,
      `Invalid id: ${String(value)}`,
      'INVALID_ID',
    );
  }

  return id;
}

export const parseIdUtils = {
  toSafeNumberId,
};
