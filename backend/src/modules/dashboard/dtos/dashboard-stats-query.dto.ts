import { IsIn, IsOptional, IsString } from 'class-validator';

export const DASHBOARD_PERIODS = [
  'day',
  'week',
  'month',
  'quarter',
  'year',
  'custom',
] as const;

export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];

/** Query cho GET /admin/dashboard/stats; mốc thời gian luôn được hiểu theo UTC. */
export class DashboardStatsQueryDto {
  @IsOptional()
  @IsIn(DASHBOARD_PERIODS, {
    message: 'Period phải là day, week, month, quarter, year hoặc custom',
  })
  period?: DashboardPeriod = 'month';

  @IsOptional()
  @IsString()
  from?: string;

  @IsOptional()
  @IsString()
  to?: string;
}
