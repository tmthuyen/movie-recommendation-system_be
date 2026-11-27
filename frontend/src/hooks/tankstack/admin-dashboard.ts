import { adminDashboardApi } from '@/apis/admin-dashboard.api';
import type {
  AdminDashboardActivity,
  AdminDashboardDataIssue,
  AdminDashboardInteractionType,
  AdminDashboardLabelDatum,
  AdminDashboardParams,
  AdminDashboardRatingBucket,
  AdminDashboardStats,
  AdminDashboardTimePoint,
  AdminDashboardTotals,
  DashboardPeriod,
} from '@/shared/types/admin-dashboard.types';
import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

/** QueryKey root của dashboard — dùng chung cho invalidate khi bấm "Làm mới". */
export const ADMIN_DASHBOARD_QUERY_ROOT = 'admin-dashboard';

const PERIODS: DashboardPeriod[] = ['day', 'week', 'month', 'quarter', 'year', 'custom'];

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const match = /^\s*(-?\d+(?:\.\d+)?)/.exec(value);
    if (match) return Number(match[1]);
  }
  return undefined;
}

function pickNumber(record: UnknownRecord | undefined, keys: string[]): number {
  if (!record) return 0;
  for (const key of keys) {
    const parsed = toNumber(record[key]);
    if (parsed !== undefined) return parsed;
  }
  return 0;
}

function pickString(record: UnknownRecord | undefined, keys: string[]): string {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

function pickRecord(record: UnknownRecord | undefined, keys: string[]): UnknownRecord | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    if (isRecord(record[key])) return record[key] as UnknownRecord;
  }
  return undefined;
}

function pickNestedString(
  record: UnknownRecord | undefined,
  parentKey: string,
  keys: string[],
): string {
  const nested = isRecord(record?.[parentKey]) ? (record?.[parentKey] as UnknownRecord) : undefined;
  return pickString(nested, keys);
}

const EMPTY_TOTALS: AdminDashboardTotals = {
  movies: 0,
  users: 0,
  genres: 0,
  interactions: 0,
  ratings: 0,
  comments: 0,
};

const EMPTY_STATS: AdminDashboardStats = {
  totals: EMPTY_TOTALS,
  timeSeries: [],
  topViewed: [],
  topActiveUsers: [],
  genreDistribution: [],
  countryDistribution: [],
  interactionTypes: [],
  ratingDistribution: [],
  topRated: [],
  dataQualityIssues: [],
  recentActivity: [],
  period: { period: 'month' },
};

function normalizeTotals(value: unknown): AdminDashboardTotals {
  const record = isRecord(value) ? value : undefined;
  return {
    movies: pickNumber(record, ['movies', 'totalMovies', 'movieCount', 'movie']),
    users: pickNumber(record, ['users', 'totalUsers', 'userCount', 'user']),
    genres: pickNumber(record, ['genres', 'totalGenres', 'genreCount', 'genre']),
    interactions: pickNumber(record, ['interactions', 'totalInteractions', 'interactionCount']),
    ratings: pickNumber(record, ['ratings', 'totalRatings', 'ratingCount']),
    comments: pickNumber(record, ['comments', 'totalComments', 'commentCount']),
  };
}

function normalizeTimePoint(value: unknown): AdminDashboardTimePoint {
  const record = isRecord(value) ? value : {};
  return {
    date: pickString(record, ['date', 'label', 'day', 'bucket']) || '—',
    interactions: pickNumber(record, ['interactions', 'click', 'count']),
    ratings: pickNumber(record, ['ratings', 'rating']),
    comments: pickNumber(record, ['comments', 'comment']),
  };
}

function normalizeLabelDatum(value: unknown): AdminDashboardLabelDatum {
  const record = isRecord(value) ? value : {};
  const label =
    pickString(record, ['label', 'name', 'title', 'viName', 'fullName', 'userName', 'email']) ||
    '—';
  return { label, value: pickNumber(record, ['value', 'count', 'total', 'viewCount', 'amount']) };
}

function normalizeInteractionType(value: unknown): AdminDashboardInteractionType {
  const record = isRecord(value) ? value : {};
  return {
    type: pickString(record, ['type', 'name', 'label']) || 'unknown',
    value: pickNumber(record, ['value', 'count', 'total']),
  };
}

function normalizeRatingBucket(value: unknown): AdminDashboardRatingBucket {
  const record = isRecord(value) ? value : {};
  return {
    rating: pickNumber(record, ['rating', 'star', 'score', 'label', 'name']),
    value: pickNumber(record, ['value', 'count', 'total']),
  };
}

function normalizeDataIssue(value: unknown): AdminDashboardDataIssue {
  const record = isRecord(value) ? value : {};
  const label = pickString(record, ['label', 'name', 'title', 'type']) || '—';
  return {
    label,
    count: pickNumber(record, ['count', 'value', 'total', 'movieCount']),
    description: pickString(record, ['description', 'message', 'detail']),
    href: pickString(record, ['href', 'link', 'url']) || '/admin/movies',
  };
}

const ACTIVITY_KIND_LABELS: Record<string, string> = {
  interaction: 'Tương tác',
  rating: 'Đánh giá',
  comment: 'Bình luận',
  click: 'Đã xem',
  like: 'Yêu thích',
};

function normalizeActivity(value: unknown, index: number): AdminDashboardActivity {
  const record = isRecord(value) ? value : {};
  const kind = pickString(record, ['kind', 'type', 'activityType']) || 'interaction';
  const kindLabel = pickString(record, ['kindLabel', 'typeLabel', 'label']) || kind;
  return {
    id: pickString(record, ['id', 'eventId']) || `${kind}-${index}`,
    kind,
    kindLabel: ACTIVITY_KIND_LABELS[kindLabel] ?? kindLabel,
    createdAt: pickString(record, ['createdAt', 'created_at', 'timestamp', 'date']) || undefined,
    userName:
      pickString(record, ['userName', 'fullName', 'email', 'userEmail']) ||
      pickNestedString(record, 'user', ['fullName', 'email', 'userName']) ||
      '—',
    userEmail:
      pickString(record, ['userEmail', 'email']) || pickNestedString(record, 'user', ['email']),
    movieTitle:
      pickString(record, ['movieTitle', 'movieName', 'title']) ||
      pickNestedString(record, 'movie', ['title', 'name', 'titleVi', 'viName']) ||
      '—',
    detail:
      pickString(record, ['detail', 'content', 'description', 'value']) ||
      ACTIVITY_KIND_LABELS[kind] ||
      kind,
  };
}

/** Chuẩn hoá `result` về đúng shape UI đang dùng (backend có thể trả thêm/thiếu field). */
function normalizeStats(value: unknown, requested: AdminDashboardParams): AdminDashboardStats {
  const record = isRecord(value) ? value : undefined;
  if (!record) return { ...EMPTY_STATS, period: { period: requested.period } };

  const periodRecord = pickRecord(record, ['period', 'dateRange', 'range']);
  const rawPeriod = pickString(periodRecord ?? record, ['period', 'value']) || requested.period;
  const period: DashboardPeriod = PERIODS.includes(rawPeriod as DashboardPeriod)
    ? (rawPeriod as DashboardPeriod)
    : requested.period;

  return {
    totals: normalizeTotals(record.totals ?? record.total),
    timeSeries: toArray(record.timeSeries ?? record.timeline).map(normalizeTimePoint),
    topViewed: toArray(record.topViewed).map(normalizeLabelDatum),
    topActiveUsers: toArray(record.topActiveUsers).map(normalizeLabelDatum),
    genreDistribution: toArray(record.genreDistribution).map(normalizeLabelDatum),
    countryDistribution: toArray(record.countryDistribution).map(normalizeLabelDatum),
    interactionTypes: toArray(record.interactionTypes).map(normalizeInteractionType),
    ratingDistribution: toArray(record.ratingDistribution).map(normalizeRatingBucket),
    topRated: toArray(record.topRated).map(normalizeLabelDatum),
    dataQualityIssues: toArray(record.dataQualityIssues).map(normalizeDataIssue),
    recentActivity: toArray(record.recentActivity).map(normalizeActivity),
    period: {
      period,
      from: pickString(periodRecord, ['from', 'start', 'startDate']) || requested.from,
      to: pickString(periodRecord, ['to', 'end', 'endDate']) || requested.to,
    },
  };
}

/**
 * Dashboard admin — lấy toàn bộ số liệu từ endpoint aggregate của backend.
 * Mọi widget (kể cả "Hoạt động gần đây") đều đi theo `period`/`from`/`to`.
 */
export function useAdminDashboard(params: AdminDashboardParams) {
  const queryClient = useQueryClient();
  const { period, from, to } = params;
  /** `custom` cần đủ 2 đầu khoảng thời gian mới gọi API. */
  const enabled = period !== 'custom' || Boolean(from && to);

  const query = useQuery({
    queryKey: [ADMIN_DASHBOARD_QUERY_ROOT, { period, from: from ?? null, to: to ?? null }],
    queryFn: () => adminDashboardApi.getStats({ period, from, to }),
    enabled,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  const stats = useMemo(
    () => normalizeStats(query.data?.result, { period, from, to }),
    [query.data, period, from, to],
  );

  /** Làm mới mọi kỳ/range của dashboard (invalidate theo queryKey root). */
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: [ADMIN_DASHBOARD_QUERY_ROOT] });
  }, [queryClient]);

  return {
    ...stats,
    /** true khi khoảng custom chưa đủ điều kiện để gọi API. */
    isRangeIncomplete: !enabled,
    isLoading: query.isLoading,
    isError: query.isError,
    isFetching: query.isFetching,
    refresh,
  };
}
