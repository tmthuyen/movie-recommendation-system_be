import type { FilterFieldConfig } from '@/shared/utils/search-query';

/**
 * Field lọc cho `GET /api/peoples`.
 * Whitelist backend: `id`, `fullName`, `nationality`, `gender`, `mainRole`,
 * `birthDate`, `createdAt`, `updatedAt`.
 */
export const PEOPLE_FILTER_FIELDS: FilterFieldConfig[] = [
  {
    field: 'fullName',
    label: 'Họ tên',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'in', 'notin'],
    placeholder: 'VD: Tom Holland',
  },
  {
    field: 'nationality',
    label: 'Quốc tịch',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
    placeholder: 'VD: British',
  },
  {
    field: 'gender',
    label: 'Giới tính',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
    placeholder: 'VD: Male',
  },
  {
    field: 'mainRole',
    label: 'Vai trò chính',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
    placeholder: 'VD: actor',
  },
  {
    field: 'birthDate',
    label: 'Ngày sinh',
    type: 'date',
    operators: ['gte', 'lte', 'between', 'isnull', 'isnotnull'],
  },
  {
    field: 'id',
    label: 'ID',
    type: 'number',
    operators: ['gt', 'gte', 'lt', 'lte', 'between', 'in', 'notin'],
  },
];
