import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import {
  DashboardPeriod,
  DashboardStatsQueryDto,
} from './dtos/dashboard-stats-query.dto';
import type {
  DashboardDateRange,
  DashboardStats,
} from './dashboard.interfaces';
import { IDASHBOARD_REPOSITORY } from './dashboard.repository';
import type { IDashboardRepository } from './dashboard.repository';

/** Các kỳ tương đối — luôn tính theo UTC, kết thúc là 23:59:59.999Z của ngày hiện tại. */
const PERIOD_DAYS: Record<Exclude<DashboardPeriod, 'custom'>, number> = {
  day: 1,
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
};

@Injectable()
export class DashboardService {
  constructor(
    @Inject(IDASHBOARD_REPOSITORY)
    private readonly repo: IDashboardRepository,
  ) {}

  private parseBoundary(value: string, field: 'from' | 'to'): Date {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BadRequestException(`Thiếu mốc thời gian ${field}`);
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const date = new Date(`${trimmed}T00:00:00.000Z`);
      if (
        Number.isNaN(date.getTime()) ||
        date.toISOString().slice(0, 10) !== trimmed
      ) {
        throw new BadRequestException(`Ngày ${field} không hợp lệ: ${value}`);
      }
      if (field === 'to') date.setUTCHours(23, 59, 59, 999);
      return date;
    }

    if (!/(Z|[+-]\d{2}:\d{2})$/.test(trimmed)) {
      throw new BadRequestException(
        `Mốc ${field} phải là YYYY-MM-DD hoặc ISO có Z/offset thời gian`,
      );
    }

    const date = new Date(trimmed);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Ngày ${field} không hợp lệ: ${value}`);
    }
    return date;
  }

  private resolveRange(query: DashboardStatsQueryDto): {
    period: DashboardPeriod;
    range: DashboardDateRange;
  } {
    const period: DashboardPeriod = query.period ?? 'month';

    if (period === 'custom') {
      if (!query.from || !query.to) {
        throw new BadRequestException(
          'period=custom bắt buộc phải có cả from và to',
        );
      }
      const from = this.parseBoundary(query.from, 'from');
      const to = this.parseBoundary(query.to, 'to');
      if (from.getTime() > to.getTime()) {
        throw new BadRequestException('from phải nhỏ hơn hoặc bằng to');
      }
      return { period, range: { from, to } };
    }

    const now = new Date();
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    const from = new Date(todayUtc - (PERIOD_DAYS[period] - 1) * 86_400_000);
    const to = new Date(todayUtc + 86_400_000 - 1);
    return { period, range: { from, to } };
  }

  async getStats(query: DashboardStatsQueryDto): Promise<DashboardStats> {
    const { period, range } = this.resolveRange(query);

    const [
      totals,
      timeSeries,
      topViewed,
      topActiveUsers,
      genreDistribution,
      countryDistribution,
      interactionTypes,
      ratingDistribution,
      topRated,
      dataQualityIssues,
      recentActivity,
    ] = await Promise.all([
      this.repo.getTotals(range),
      this.repo.getTimeSeries(range),
      this.repo.getTopViewed(),
      this.repo.getTopActiveUsers(range),
      this.repo.getGenreDistribution(),
      this.repo.getCountryDistribution(),
      this.repo.getInteractionTypes(range),
      this.repo.getRatingDistribution(range),
      this.repo.getTopRated(range),
      this.repo.getDataQualityIssues(),
      this.repo.getRecentActivity(range),
    ]);

    return {
      totals,
      timeSeries,
      topViewed,
      topActiveUsers,
      genreDistribution,
      countryDistribution,
      interactionTypes,
      ratingDistribution,
      topRated,
      dataQualityIssues,
      recentActivity,
      period: {
        period,
        from: range.from.toISOString(),
        to: range.to.toISOString(),
      },
    };
  }
}
