import type { FilterFieldConfig, FilterOption } from '@/shared/utils/search-query';

export interface MovieFilterOptions {
  genreOptions: FilterOption[];
  countryOptions: FilterOption[];
  peopleOptions: FilterOption[];
}

/** Các cột text có thể lọc "rỗng/null" (dùng `empty`/`isnull`). */
const TEXT_COLUMNS: Array<{ field: string; label: string; placeholder?: string }> = [
  { field: 'title', label: 'Tên phim', placeholder: 'VD: The Matrix' },
  { field: 'titleVi', label: 'Tên tiếng Việt', placeholder: 'VD: Ma trận' },
  { field: 'overview', label: 'Mô tả (tiếng Anh)' },
  { field: 'overviewVi', label: 'Mô tả (tiếng Việt)' },
  { field: 'posterPath', label: 'Poster path' },
  { field: 'backdropPath', label: 'Backdrop path' },
  { field: 'homepage', label: 'Trang chủ' },
  { field: 'imdbId', label: 'IMDB ID', placeholder: 'VD: tt0133093' },
  { field: 'originCountry', label: 'Quốc gia gốc', placeholder: 'VD: US' },
  { field: 'originalLanguage', label: 'Ngôn ngữ gốc', placeholder: 'VD: en' },
  { field: 'status', label: 'Trạng thái', placeholder: 'VD: Released' },
];

/**
 * Field lọc cho `GET /api/movies`.
 *
 * Whitelist backend (`movies.repository.ts`): `id`, `tmdbId`, `imdbId`, `title`,
 * `titleVi`, `overview`, `overviewVi`, `homepage`, `posterPath`, `backdropPath`,
 * `releaseDate`, `status`, `originCountry`, `originalLanguage`, `tmdbRating`,
 * `voteAverage`, `voteCount`, `viewCount`, `likeCount`, `createdAt`, `updatedAt`,
 * `genreId`, `countryId`, `peopleId`.
 *
 * `eq` dùng `UPPER(column)` nên chỉ dùng cho cột text/enum; số/ngày/id dùng
 * `gt/gte/lt/lte/between` hoặc `in`. Quan hệ (thể loại/quốc gia/người) hiển thị
 * **tên** nhưng gửi **id** qua `in`/`notin`.
 */
export function createMovieFilterFields({
  genreOptions,
  countryOptions,
  peopleOptions,
}: MovieFilterOptions): FilterFieldConfig[] {
  return [
    {
      field: 'genreId',
      label: 'Thể loại',
      type: 'enum',
      operators: ['in', 'notin'],
      options: genreOptions,
    },
    {
      field: 'countryId',
      label: 'Quốc gia',
      type: 'enum',
      operators: ['in', 'notin'],
      options: countryOptions,
    },
    {
      field: 'peopleId',
      label: 'Người tham gia',
      type: 'enum',
      operators: ['in', 'notin'],
      options: peopleOptions,
    },
    ...TEXT_COLUMNS.map<FilterFieldConfig>(({ field, label, placeholder }) => ({
      field,
      label,
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
      placeholder,
    })),
    {
      field: 'releaseDate',
      label: 'Ngày phát hành',
      type: 'date',
      operators: ['gte', 'lte', 'between', 'empty', 'notempty', 'isnull', 'isnotnull'],
    },
    {
      field: 'tmdbId',
      label: 'TMDB ID',
      type: 'number',
      operators: ['gt', 'gte', 'lt', 'lte', 'between', 'in', 'notin', 'isnull', 'isnotnull'],
    },
    {
      field: 'tmdbRating',
      label: 'Điểm TMDB',
      type: 'number',
      operators: ['gte', 'lte', 'between', 'isnull', 'isnotnull'],
    },
    {
      field: 'voteAverage',
      label: 'Điểm đánh giá',
      type: 'number',
      operators: ['gte', 'lte', 'between', 'isnull', 'isnotnull'],
    },
    {
      field: 'voteCount',
      label: 'Lượt bình chọn',
      type: 'number',
      operators: ['gte', 'lte', 'between'],
    },
    {
      field: 'viewCount',
      label: 'Lượt xem',
      type: 'number',
      operators: ['gte', 'lte', 'between'],
    },
    {
      field: 'likeCount',
      label: 'Lượt thích',
      type: 'number',
      operators: ['gte', 'lte', 'between'],
    },
    {
      field: 'id',
      label: 'ID phim',
      type: 'number',
      operators: ['gt', 'gte', 'lt', 'lte', 'between', 'in', 'notin'],
    },
    {
      field: 'createdAt',
      label: 'Ngày tạo',
      type: 'date',
      operators: ['gte', 'lte', 'between'],
    },
  ];
}
