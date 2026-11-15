import type { FilterFieldConfig, FilterOption } from '@/shared/utils/search-query';

/**
 * Field lọc cho `GET /api/users`.
 * Whitelist backend (`users.repository.ts`): `id`, `email`, `fullName`,
 * `phoneNumber`, `status`, `isVerified`, `gender`, `birthDate`, `createdAt`,
 * `updatedAt`, `roleId`, `roleCode`.
 *
 * Lưu ý: `eq` dùng `UPPER(column)` nên chỉ an toàn với cột text/enum — không
 * dùng cho `id` (uuid), `isVerified` (boolean) hay cột ngày. Quan hệ vai trò
 * hiển thị **tên** nhưng gửi **id** qua `in`/`notin`.
 */
export function createUserFilterFields(roleOptions: FilterOption[]): FilterFieldConfig[] {
  return [
    {
      field: 'roleId',
      label: 'Vai trò',
      type: 'enum',
      operators: ['in', 'notin'],
      options: roleOptions,
    },
    {
      field: 'fullName',
      label: 'Họ tên',
      type: 'text',
      operators: [
        'contains',
        'eq',
        'ne',
        'in',
        'notin',
        'empty',
        'notempty',
        'isnull',
        'isnotnull',
      ],
      placeholder: 'VD: Nguyễn Văn A',
    },
    {
      field: 'email',
      label: 'Email',
      type: 'text',
      operators: ['contains', 'eq', 'ne', 'in', 'notin'],
      placeholder: 'VD: user@example.com',
    },
    {
      field: 'phoneNumber',
      label: 'Số điện thoại',
      type: 'text',
      operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
      placeholder: 'VD: 0901234567',
    },
    {
      field: 'status',
      label: 'Trạng thái',
      type: 'enum',
      operators: ['eq', 'ne', 'in', 'notin'],
      options: [
        { value: 'UNVERIFIED', label: 'Chưa xác thực' },
        { value: 'ACTIVE', label: 'Hoạt động' },
        { value: 'INACTIVE', label: 'Không hoạt động' },
        { value: 'BLOCKED', label: 'Đã khóa' },
      ],
    },
    {
      field: 'roleCode',
      label: 'Mã vai trò',
      type: 'text',
      operators: ['contains', 'eq', 'ne', 'in', 'notin'],
      placeholder: 'VD: ADMIN',
    },
    {
      field: 'gender',
      label: 'Giới tính',
      type: 'text',
      operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
      placeholder: 'VD: male',
    },
    {
      field: 'birthDate',
      label: 'Ngày sinh',
      type: 'date',
      operators: ['gte', 'lte', 'between', 'isnull', 'isnotnull'],
    },
    {
      field: 'createdAt',
      label: 'Ngày tạo',
      type: 'date',
      operators: ['gte', 'lte', 'between'],
    },
  ];
}
