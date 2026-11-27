import type {
  AdminFormDirtyFields,
  AdminFormValues,
} from '@/components/admin/data-view/admin-form-schema';
import type { AdminUserInput, AdminUserUpdateInput } from '@/hooks/tankstack/admin';

const TEXT_FIELDS = [
  'email',
  'fullName',
  'phoneNumber',
  'birthDate',
  'gender',
  'avatarUrl',
] as const;

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

/** Select dùng chuỗi 'true'/'false' vì `AdminFormField` chưa có control boolean. */
function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  return typeof value === 'string' && value.trim().toLowerCase() === 'true';
}

function buildCreateInput(values: AdminFormValues): AdminUserInput {
  return {
    email: String(values.email ?? '').trim(),
    fullName: String(values.fullName ?? '').trim(),
    password: String(values.password ?? ''),
    confirmPassword: String(values.confirmPassword ?? ''),
    roleIds: Array.isArray(values.roleIds)
      ? values.roleIds.map(Number).filter(Number.isFinite)
      : [],
  };
}

/**
 * Tạo payload cho `POST /users` (đủ field + roleIds) hoặc `PUT /users/:id`
 * (chỉ field dirty). `roleIds` không gửi khi sửa — dùng dialog “Gán vai trò” riêng.
 */
export function buildUserPayload(
  values: AdminFormValues,
  dirtyFields: AdminFormDirtyFields,
  isEdit: false,
): AdminUserInput;
export function buildUserPayload(
  values: AdminFormValues,
  dirtyFields: AdminFormDirtyFields,
  isEdit: true,
): AdminUserUpdateInput;
export function buildUserPayload(
  values: AdminFormValues,
  dirtyFields: AdminFormDirtyFields,
  isEdit: boolean,
): AdminUserInput | AdminUserUpdateInput {
  if (!isEdit) return buildCreateInput(values);

  const payload: AdminUserUpdateInput = {};

  for (const name of TEXT_FIELDS) {
    if (dirtyFields[name] === true) {
      payload[name] = optionalText(values[name]);
    }
  }

  if (dirtyFields.status === true) {
    payload.status = optionalText(values.status);
  }

  if (dirtyFields.isVerified === true) {
    payload.isVerified = toBoolean(values.isVerified);
  }

  return payload;
}
