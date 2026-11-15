import type { FilterFieldConfig } from '@/shared/utils/search-query';

/**
 * Field lọc cho `GET /api/countries`.
 * Whitelist backend: `id`, `viName`, `enName`, `code`, `region`, `subregion`,
 * `createdAt`, `updatedAt`.
 */
export const COUNTRY_FILTER_FIELDS: FilterFieldConfig[] = [
  {
    field: 'viName',
    label: 'Tên (tiếng Việt)',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'in', 'notin'],
    placeholder: 'VD: Việt Nam',
  },
  {
    field: 'enName',
    label: 'Tên (tiếng Anh)',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
    placeholder: 'VD: Vietnam',
  },
  {
    field: 'code',
    label: 'Mã quốc gia',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'in', 'notin'],
    placeholder: 'VD: VN',
  },
  {
    field: 'region',
    label: 'Khu vực',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'in'],
    placeholder: 'VD: Asia',
  },
  {
    field: 'subregion',
    label: 'Tiểu vùng',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
    placeholder: 'VD: Southeast Asia',
  },
  {
    field: 'id',
    label: 'ID',
    type: 'number',
    operators: ['gt', 'gte', 'lt', 'lte', 'between', 'in', 'notin'],
  },
];
