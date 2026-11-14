import { AppException } from '@/common/custom-exception/app-exception';
import * as crypto from 'crypto';

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

// UUID
const generateUUID = () => {
  return crypto.randomUUID();
};

// UUID v7

// Ulid

export const idUtil = {
  toSafeNumberId,
  generateUUID,
};
