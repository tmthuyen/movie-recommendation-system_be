import { createHash } from 'crypto';

const PREFIX = 'cache';

/** TTL cache (giây). */
export const CacheTtl = {
  movieDetail: 60,
  movieList: 180,
  movieKeyword: 60,
  lookup: 3600,
  interactionStats: 60,
  recommendation: 900,
} as const;

/** Số trang tối đa được cache cho list/search. */
export const MAX_CACHED_PAGE = 3;

/** Số phim gợi ý lấy một lần từ ai-service. */
export const RECOMMENDATION_WINDOW = 100;

function buildKey(...parts: (string | number | undefined)[]): string {
  return [
    PREFIX,
    ...parts.filter(p => p !== undefined && p !== null && p !== ''),
  ]
    .join(':')
    .replace(/::+/g, ':');
}

/** Hash phần filter của query sau khi sắp xếp key và bỏ giá trị rỗng. */
function hashFilters(filters: Record<string, unknown>): string {
  const normalized = Object.keys(filters)
    .filter(
      key =>
        filters[key] !== undefined &&
        filters[key] !== null &&
        filters[key] !== '',
    )
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = filters[key];
      return acc;
    }, {});

  return createHash('sha1')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 12);
}

export const CacheKeys = {
  movie: {
    detail: (id: number) => buildKey('movie', id),
    list: (
      version: number,
      page: number,
      limit: number,
      filters?: Record<string, unknown>,
    ) =>
      buildKey(
        'movie',
        'list',
        `v${version}`,
        `p${page}`,
        `l${limit}`,
        filters && Object.keys(filters).length > 0
          ? `f${hashFilters(filters)}`
          : undefined,
      ),
    search: (
      version: number,
      page: number,
      limit: number,
      filters: Record<string, unknown>,
    ) =>
      buildKey(
        'movie',
        'search',
        `v${version}`,
        `p${page}`,
        `l${limit}`,
        `f${hashFilters(filters)}`,
      ),
    listVersion: () => buildKey('movie', 'ver', 'list'),
  },
  genre: {
    list: (version: number, page: number, limit: number, keyword?: string) =>
      buildKey(
        'genre',
        'list',
        `v${version}`,
        `p${page}`,
        `l${limit}`,
        `f${hashFilters({ keyword })}`,
      ),
    listVersion: () => buildKey('genre', 'ver', 'list'),
  },
  country: {
    list: (version: number, page: number, limit: number, keyword?: string) =>
      buildKey(
        'country',
        'list',
        `v${version}`,
        `p${page}`,
        `l${limit}`,
        `f${hashFilters({ keyword })}`,
      ),
    listVersion: () => buildKey('country', 'ver', 'list'),
  },
  interaction: {
    stats: (movieId: number) => buildKey('interaction', 'stats', movieId),
  },
  recommendation: {
    similar: (movieId: number, window: number, version: number) =>
      buildKey(
        'recommendation',
        'similar',
        movieId,
        `k${window}`,
        `v${version}`,
      ),
    similarVersion: (movieId: number) =>
      buildKey('recommendation', 'ver', 'similar', movieId),
    semantic: (keyword: string, window: number, version: number) =>
      buildKey(
        'recommendation',
        'semantic',
        `q${hashFilters({ keyword: keyword.trim().toLowerCase() })}`,
        `k${window}`,
        `v${version}`,
      ),
    lexicalRerank: (keyword: string, window: number, version: number) =>
      buildKey(
        'recommendation',
        'lexical-rerank',
        `q${hashFilters({ keyword: keyword.trim().toLowerCase() })}`,
        `k${window}`,
        `v${version}`,
      ),
    globalVersion: () => buildKey('recommendation', 'ver', 'global'),
  },
} as const;
