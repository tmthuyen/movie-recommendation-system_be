import { z } from 'zod';

/** Kiểu control của một field trong dialog form admin. */
export type AdminFormFieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect';

/** Cấu hình một field form — đủ để render control + sinh validate zod. */
export interface AdminFormField {
  name: string;
  label: string;
  /** Mặc định `text`. */
  type?: AdminFormFieldType;
  placeholder?: string;
  /** Gợi ý hiển thị dưới control. */
  description?: string;
  required?: boolean;
  /** Dùng cho `select`/`multiselect`. */
  options?: Array<{ value: string; label: string }>;
  min?: number;
  max?: number;
  /** Giới hạn độ dài chuỗi (text/textarea). */
  maxLength?: number;
  step?: number;
  /** Chiếm toàn bộ chiều ngang trong layout 2 cột. */
  wide?: boolean;
}

export type AdminFormValues = Record<string, unknown>;

/** `formState.dirtyFields` của React Hook Form cho các form admin (field đều là cấp 1). */
export type AdminFormDirtyFields = Record<string, boolean | undefined>;

function toOptionalNumber(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function buildNumberSchema(field: AdminFormField): z.ZodTypeAny {
  let numeric = z.number({ error: `${field.label} phải là số` });
  if (field.min !== undefined) {
    numeric = numeric.min(field.min, `${field.label} tối thiểu là ${field.min}`);
  }
  if (field.max !== undefined) {
    numeric = numeric.max(field.max, `${field.label} tối đa là ${field.max}`);
  }

  if (field.required) {
    return z.preprocess(
      toOptionalNumber,
      numeric
        .optional()
        .refine((value) => value !== undefined, { message: `${field.label} là bắt buộc` }),
    );
  }

  return z.preprocess(toOptionalNumber, numeric.optional());
}

/**
 * Sinh schema zod từ cấu hình field (react-hook-form + zodResolver).
 * Message lỗi tiếng Việt, bám theo `required`/`min`/`max` của từng field.
 */
export function buildAdminFormSchema(
  fields: AdminFormField[],
): z.ZodType<AdminFormValues, AdminFormValues> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    const type = field.type ?? 'text';

    if (type === 'number') {
      shape[field.name] = buildNumberSchema(field);
      continue;
    }

    if (type === 'multiselect') {
      const list = z.array(z.string());
      shape[field.name] = field.required ? list.min(1, `${field.label} là bắt buộc`) : list;
      continue;
    }

    const text = z.string().trim();
    const bounded =
      field.maxLength !== undefined
        ? text.max(field.maxLength, `${field.label} tối đa ${field.maxLength} ký tự`)
        : text;
    shape[field.name] = field.required
      ? bounded.min(1, `${field.label} là bắt buộc`)
      : bounded.optional();
  }

  return z.object(shape) as unknown as z.ZodType<AdminFormValues, AdminFormValues>;
}
