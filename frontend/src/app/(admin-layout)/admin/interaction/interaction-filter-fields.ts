import type { FilterFieldConfig, FilterOption } from '@/shared/utils/search-query';

/** Cột text dùng chung cho các bảng tương tác. */
function textFilters(): FilterFieldConfig[] {
  return [
    {
      field: 'userFullName',
      label: 'Người dùng',
      type: 'text',
      operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
      placeholder: 'VD: Nguyễn Văn A',
    },
    {
      field: 'userEmail',
      label: 'Email người dùng',
      type: 'text',
      operators: ['contains', 'eq', 'ne'],
      placeholder: 'VD: user@example.com',
    },
    {
      field: 'movieTitle',
      label: 'Tên phim',
      type: 'text',
      operators: ['contains', 'eq', 'ne'],
      placeholder: 'VD: The Matrix',
    },
  ];
}

function movieFilter(movieOptions: FilterOption[]): FilterFieldConfig {
  return {
    field: 'movieId',
    label: 'Phim',
    type: 'enum',
    operators: ['in', 'notin'],
    options: movieOptions,
  };
}

const CREATED_AT_FILTER: FilterFieldConfig = {
  field: 'createdAt',
  label: 'Ngày tạo',
  type: 'date',
  operators: ['gte', 'lte', 'between'],
};

/**
 * Field lọc cho `GET /api/ratings`.
 * Whitelist backend: `id`, `rating`, `content`, `timestamp`, `createdAt`,
 * `updatedAt`, `userId`, `userEmail`, `userFullName`, `movieId`, `movieTitle`.
 * Quan hệ phim hiển thị **tên phim** nhưng gửi **movieId** qua `in`/`notin`.
 */
export function createRatingFilterFields(movieOptions: FilterOption[]): FilterFieldConfig[] {
  return [
    movieFilter(movieOptions),
    {
      field: 'rating',
      label: 'Số sao',
      type: 'number',
      operators: ['gte', 'lte', 'between'],
    },
    {
      field: 'content',
      label: 'Nội dung',
      type: 'text',
      operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
      placeholder: 'VD: Phim rất hay',
    },
    ...textFilters(),
    CREATED_AT_FILTER,
  ];
}

/**
 * Field lọc cho `GET /api/comments`.
 * Whitelist backend: `id`, `content`, `parentId`, `createdAt`, `updatedAt`,
 * `userId`, `userEmail`, `userFullName`, `movieId`, `movieTitle`.
 */
export function createCommentFilterFields(movieOptions: FilterOption[]): FilterFieldConfig[] {
  return [
    movieFilter(movieOptions),
    {
      field: 'content',
      label: 'Nội dung',
      type: 'text',
      operators: ['contains', 'eq', 'ne', 'empty', 'notempty', 'isnull', 'isnotnull'],
      placeholder: 'VD: Phim hay',
    },
    {
      field: 'parentId',
      label: 'Bình luận cha',
      type: 'number',
      operators: ['gt', 'gte', 'lt', 'lte', 'between', 'in', 'notin', 'isnull', 'isnotnull'],
    },
    ...textFilters(),
    CREATED_AT_FILTER,
  ];
}

/**
 * Field lọc cho `GET /api/interactions` (tab Like/Click).
 * Whitelist backend: `id`, `score`, `type`, `createdAt`, `updatedAt`,
 * `userId`, `userEmail`, `userFullName`, `movieId`, `movieTitle`.
 */
export function createInteractionFilterFields(movieOptions: FilterOption[]): FilterFieldConfig[] {
  return [
    movieFilter(movieOptions),
    {
      field: 'type',
      label: 'Loại tương tác',
      type: 'enum',
      operators: ['eq', 'ne', 'in', 'notin'],
      options: [
        { value: 'like', label: 'Yêu thích' },
        { value: 'click', label: 'Lượt xem' },
      ],
    },
    ...textFilters(),
    {
      field: 'score',
      label: 'Điểm tương tác',
      type: 'number',
      operators: ['gte', 'lte', 'between'],
    },
    CREATED_AT_FILTER,
  ];
}
