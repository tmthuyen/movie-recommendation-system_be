import { DashboardPeriod } from './dtos/dashboard-stats-query.dto';

/** Khoảng thời gian UTC đã được chuẩn hoá, dùng cho mọi truy vấn aggregate. */
export interface DashboardDateRange {
  from: Date;
  to: Date;
}

export interface DashboardTotals {
  /** Snapshot toàn DB — không phụ thuộc khoảng thời gian. */
  movies: number;
  users: number;
  genres: number;
  /** Số bản ghi phát sinh trong khoảng thời gian đã chọn. */
  interactions: number;
  ratings: number;
  comments: number;
}

export interface DashboardTimePoint {
  /** Ngày UTC dạng YYYY-MM-DD. */
  date: string;
  interactions: number;
  ratings: number;
  comments: number;
}

export interface DashboardLabelDatum {
  label: string;
  value: number;
}

export interface DashboardInteractionTypeDatum {
  type: string;
  value: number;
}

export interface DashboardRatingBucket {
  rating: number;
  value: number;
}

export interface DashboardDataQualityIssue {
  label: string;
  count: number;
  description: string;
  href: string;
}

export interface DashboardActivity {
  id: string;
  kind: string;
  kindLabel: string;
  createdAt?: string;
  userName: string;
  userEmail?: string;
  movieTitle: string;
  detail: string;
}

export interface DashboardStats {
  totals: DashboardTotals;
  timeSeries: DashboardTimePoint[];
  topViewed: DashboardLabelDatum[];
  topActiveUsers: DashboardLabelDatum[];
  genreDistribution: DashboardLabelDatum[];
  countryDistribution: DashboardLabelDatum[];
  interactionTypes: DashboardInteractionTypeDatum[];
  ratingDistribution: DashboardRatingBucket[];
  topRated: DashboardLabelDatum[];
  dataQualityIssues: DashboardDataQualityIssue[];
  recentActivity: DashboardActivity[];
  period: {
    period: DashboardPeriod;
    from: string;
    to: string;
  };
}
