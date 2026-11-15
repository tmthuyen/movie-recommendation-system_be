import type { FilterFieldConfig } from '@/shared/utils/search-query';

/**
 * Field lọc cho `GET /api/genres`.
 * Whitelist backend: `id`, `name`, `enName`, `createdAt`, `updatedAt`.
 */
export const GENRE_FILTER_FIELDS: FilterFieldConfig[] = [
  {
    field: 'name',
    label: 'Tên thể loại',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'in', 'notin'],
    placeholder: 'VD: Hành động',
  },
  {
    field: 'enName',
    label: 'Tên tiếng Anh',
    type: 'text',
    operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
    placeholder: 'VD: Action',
  },
  {
    field: 'id',
    label: 'ID',
    type: 'number',
    operators: ['gt', 'gte', 'lt', 'lte', 'between', 'in', 'notin'],
  },
];
