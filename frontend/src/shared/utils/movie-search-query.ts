import qs from 'qs';
import { MovieQuery } from '@/shared/types/movie.types';

/** Giá trị `sort` đúng theo query API `/movies/search` (whitelist backend). */
export type MovieSortOption =
  'releaseDate:DESC' | 'voteAverage:DESC' | 'viewCount:DESC' | 'likeCount:DESC';

export interface MovieSearchFilters {
  keyword: string;
  genreIds: number[];
  countryIds: number[];
  sort: MovieSortOption;
  page: number;
  limit: number;
  releaseYearFrom?: number;
  releaseYearTo?: number;
}

export const DEFAULT_MOVIE_FILTERS: MovieSearchFilters = {
  keyword: '',
  genreIds: [],
  countryIds: [],
  sort: 'releaseDate:DESC',
  page: 1,
  limit: 24,
};

const ALLOWED_SORT: Set<string> = new Set([
  'releaseDate:DESC',
  'releaseDate:ASC',
  'voteAverage:DESC',
  'voteAverage:ASC',
  'viewCount:DESC',
  'viewCount:ASC',
  'likeCount:DESC',
  'likeCount:ASC',
]);

function parseIdList(value: string | string[] | null): number[] {
  if (!value) return [];
  const values = Array.isArray(value) ? value : [value];
  return values
    .flatMap((v) => String(v).split(','))
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n) && n > 0);
}

function parsePositiveInt(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function parseOptionalYear(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isInteger(n) && n >= 1888 && n <= 2100 ? n : undefined;
}

function parseSort(value: string | null): MovieSortOption {
  if (value && ALLOWED_SORT.has(value)) return value as MovieSortOption;
  return DEFAULT_MOVIE_FILTERS.sort;
}

/** Parse `URLSearchParams` (hoặc string query) thành filter có giá trị hợp lệ. */
export function parseMovieSearchFilters(params: URLSearchParams | string): MovieSearchFilters {
  const sp = typeof params === 'string' ? new URLSearchParams(params) : params;

  const yearFrom = parseOptionalYear(sp.get('releaseYearFrom'));
  const yearTo = parseOptionalYear(sp.get('releaseYearTo'));
  const [from, to] =
    yearFrom !== undefined && yearTo !== undefined && yearFrom > yearTo
      ? [yearTo, yearFrom]
      : [yearFrom, yearTo];

  return {
    keyword: (sp.get('keyword') ?? '').trim(),
    genreIds: parseIdList(
      sp.getAll('genreIds').length ? sp.getAll('genreIds') : sp.get('genreIds'),
    ),
    countryIds: parseIdList(
      sp.getAll('countryIds').length ? sp.getAll('countryIds') : sp.get('countryIds'),
    ),
    sort: parseSort(sp.get('sort')),
    page: parsePositiveInt(sp.get('page'), 1),
    limit: Math.min(parsePositiveInt(sp.get('limit'), 24), 100),
    ...(from !== undefined ? { releaseYearFrom: from } : {}),
    ...(to !== undefined ? { releaseYearTo: to } : {}),
  };
}

/** Build query string ổn định (bỏ default/rỗng) để so sánh chống loop và dùng cho URL/API. */
export function buildMovieSearchQuery(
  filters: Partial<MovieSearchFilters>,
  defaults: MovieSearchFilters = DEFAULT_MOVIE_FILTERS,
): string {
  const merged: MovieSearchFilters = { ...defaults, ...filters };
  const params: Record<string, unknown> = {};

  const keyword = merged.keyword.trim();
  if (keyword) params.keyword = keyword;
  if (merged.genreIds.length) params.genreIds = merged.genreIds;
  if (merged.countryIds.length) params.countryIds = merged.countryIds;
  if (merged.sort !== defaults.sort) params.sort = merged.sort;
  if (merged.releaseYearFrom !== undefined) params.releaseYearFrom = merged.releaseYearFrom;
  if (merged.releaseYearTo !== undefined) params.releaseYearTo = merged.releaseYearTo;
  if (merged.page > 1) params.page = merged.page;
  if (merged.limit !== defaults.limit) params.limit = merged.limit;

  return qs.stringify(params, { arrayFormat: 'repeat', encode: true });
}

export function toMovieApiQuery(filters: MovieSearchFilters): MovieQuery {
  return {
    page: filters.page,
    limit: filters.limit,
    ...(filters.keyword.trim() ? { keyword: filters.keyword.trim() } : {}),
    ...(filters.genreIds.length ? { genreIds: filters.genreIds } : {}),
    ...(filters.countryIds.length ? { countryIds: filters.countryIds } : {}),
    sort: filters.sort,
    ...(filters.releaseYearFrom !== undefined ? { releaseYearFrom: filters.releaseYearFrom } : {}),
    ...(filters.releaseYearTo !== undefined ? { releaseYearTo: filters.releaseYearTo } : {}),
  };
}

export function countActiveMovieFilters(filters: MovieSearchFilters): number {
  let count = 0;
  if (filters.keyword.trim()) count += 1;
  count += filters.genreIds.length;
  count += filters.countryIds.length;
  if (filters.sort !== DEFAULT_MOVIE_FILTERS.sort) count += 1;
  if (filters.releaseYearFrom !== undefined || filters.releaseYearTo !== undefined) count += 1;
  return count;
}
