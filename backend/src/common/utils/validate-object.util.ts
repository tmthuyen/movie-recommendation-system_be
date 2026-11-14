import { AppException } from '@/common/custom-exception/app-exception';
import { z } from 'zod';

export function validateWithZodSchema<T extends z.ZodType>(
  schema: T,
  payload: unknown,
): z.infer<T> {
  const result = schema.safeParse(payload);

  if (!result.success) {
    console.log('Payload validation failed:', result.error.issues);
    throw new AppException(
      400,
      'Dữ liệu không hợp lệ',
      `Dữ liệu không hợp lệ: ${result.error.issues
        .map(issue => `${issue.path.join('.')}: ${issue.message}`)
        .join('; ')}`,
      'INVALID_PAYLOAD',
    );
  }

  return result.data;
}
