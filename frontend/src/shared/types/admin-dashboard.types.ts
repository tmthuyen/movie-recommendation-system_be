/** Kỳ thống kê của `GET /api/admin/dashboard/stats`. */
export type DashboardPeriod = 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface AdminDashboardParams {
  period: DashboardPeriod;
  /** Ngày bắt đầu (ISO hoặc `YYYY-MM-DD`) — bắt buộc khi `period = custom`. */
  from?: string;
  /** Ngày kết thúc (ISO hoặc `YYYY-MM-DD`) — bắt buộc khi `period = custom`. */
  to?: string;
}

export interface AdminDashboardTotals {
  movies: number;
  users: number;
  genres: number;
  interactions: number;
  ratings: number;
  comments: number;
}

export interface AdminDashboardTimePoint {
  date: string;
  interactions: number;
  ratings: number;
  comments: number;
}

export interface AdminDashboardLabelDatum {
  label: string;
  value: number;
}

export interface AdminDashboardInteractionType {
  type: string;
  value: number;
}

export interface AdminDashboardRatingBucket {
  rating: number;
  value: number;
}

export interface AdminDashboardDataIssue {
  label: string;
  count: number;
  description?: string;
  href?: string;
}

export interface AdminDashboardActivity {
  id: string;
  kind: string;
  kindLabel: string;
  createdAt?: string;
  userName: string;
  userEmail?: string;
  movieTitle: string;
  detail: string;
}

/** `result` của endpoint aggregate dashboard admin. */
export interface AdminDashboardStats {
  totals: AdminDashboardTotals;
  timeSeries: AdminDashboardTimePoint[];
  topViewed: AdminDashboardLabelDatum[];
  topActiveUsers: AdminDashboardLabelDatum[];
  genreDistribution: AdminDashboardLabelDatum[];
  countryDistribution: AdminDashboardLabelDatum[];
  interactionTypes: AdminDashboardInteractionType[];
  ratingDistribution: AdminDashboardRatingBucket[];
  topRated: AdminDashboardLabelDatum[];
  dataQualityIssues: AdminDashboardDataIssue[];
  recentActivity: AdminDashboardActivity[];
  period: {
    period: DashboardPeriod;
    from?: string;
    to?: string;
  };
}
