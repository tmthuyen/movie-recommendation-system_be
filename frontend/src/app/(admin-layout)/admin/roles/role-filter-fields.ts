import type { FilterFieldConfig } from '@/shared/utils/search-query';

/**
 * Field lọc cho `GET /api/roles`.
 * Whitelist backend: `id`, `code` (xem `roles.service.ts`).
 */
export const ROLE_FILTER_FIELDS: FilterFieldConfig[] = [
  {
    field: 'code',
    label: 'Mã vai trò',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'in', 'notin'],
    placeholder: 'VD: ADMIN',
  },
  {
    field: 'id',
    label: 'ID',
    type: 'number',
    operators: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'in', 'notin'],
  },
];
