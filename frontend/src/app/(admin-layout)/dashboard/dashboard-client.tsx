'use client';

import {
  Activity,
  AlertTriangle,
  Download,
  Film,
  MessageSquare,
  Star,
  Tags,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { DataTable, DataTableColumn } from '@/components/admin/data-table';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ADMIN_DASHBOARD_QUERY_ROOT, useAdminDashboard } from '@/hooks/tankstack/admin-dashboard';
import { cn } from '@/lib/utils';
import type { DashboardPeriod } from '@/shared/types/admin-dashboard.types';
import {
  downloadCsv,
  formatActivityTime,
  RecentActivityItem,
  toCsv,
} from '@/shared/utils/admin-dashboard';
import { INTERACTION_TYPE_BADGES } from '@/shared/utils/interaction';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const PERIOD_OPTIONS: Array<{ label: string; value: DashboardPeriod }> = [
  { label: 'Hôm nay', value: 'day' },
  { label: '7 ngày', value: 'week' },
  { label: '30 ngày', value: 'month' },
  { label: 'Quý', value: 'quarter' },
  { label: 'Năm', value: 'year' },
  { label: 'Tuỳ chỉnh', value: 'custom' },
];

const Y_AXIS_WIDTH = 130;

interface StatCardProps {
  title: string;
  value?: number;
  isLoading: boolean;
  isError?: boolean;
  icon: React.ReactNode;
}

/** Thẻ chỉ số — nhãn + số cụ thể (không dùng màu làm dấu hiệu duy nhất). */
function StatCard({ title, value, isLoading, isError, icon }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
        <span className="text-muted-foreground" aria-hidden="true">
          {icon}
        </span>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          <p className="text-2xl font-semibold tabular-nums">
            {isError ? '—' : (value ?? 0).toLocaleString('vi-VN')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

interface ChartFrameProps {
  title: string;
  /** Mô tả cho screen reader (recharts SVG không tự có accessible name). */
  ariaLabel: string;
  isLoading: boolean;
  isError?: boolean;
  isEmpty?: boolean;
  emptyTitle?: string;
  /** Ghi chú nhỏ dưới tiêu đề (đơn vị, khoảng thời gian…). */
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

/** Khung biểu đồ dùng chung: tiêu đề + trạng thái loading/error/empty + aria-label. */
function ChartFrame({
  title,
  ariaLabel,
  isLoading,
  isError,
  isEmpty,
  emptyTitle = 'Chưa có dữ liệu',
  hint,
  children,
  className,
}: ChartFrameProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-[280px] w-full" />
        ) : isError ? (
          <ErrorState title="Không thể tải dữ liệu" description="Thử lại sau ít phút." />
        ) : isEmpty ? (
          <div className="flex h-[280px] items-center justify-center">
            <EmptyState title={emptyTitle} description="Dữ liệu sẽ xuất hiện khi có hoạt động." />
          </div>
        ) : (
          <div role="img" aria-label={ariaLabel} className="h-[280px] w-full">
            {children}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Biểu đồ cột ngang dùng chung cho các bảng xếp hạng (top phim / user / thể loại…). */
function HorizontalBarChart({
  data,
  colorMode = 'multi',
  valueName,
  suffix = '',
}: {
  data: Array<{ label: string; value: number }>;
  colorMode?: 'multi' | 'single';
  valueName: string;
  suffix?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <XAxis
          type="number"
          allowDecimals={colorMode === 'single' ? true : false}
          tick={{ fontSize: 12 }}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={Y_AXIS_WIDTH}
          tick={{ fontSize: 12 }}
          interval={0}
        />
        <Tooltip
          formatter={(value) => [`${Number(value).toLocaleString('vi-VN')}${suffix}`, valueName]}
          cursor={{ fill: 'var(--muted)' }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell
              key={`${entry.label}-${index}`}
              fill={
                colorMode === 'multi' ? CHART_COLORS[index % CHART_COLORS.length] : CHART_COLORS[1]
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Ngày ngắn gọn cho trục thời gian (giữ nguyên chuỗi nếu backend trả nhãn có sẵn). */
function formatTimePointLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

/**
 * Dashboard admin — toàn bộ số liệu lấy từ `GET /api/admin/dashboard/stats`
 * theo kỳ hoặc khoảng thời gian đã chọn (backend aggregate, không lấy mẫu client).
 */
export function DashboardClient() {
  const [period, setPeriod] = useState<DashboardPeriod>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const {
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
    period: appliedPeriod,
    isRangeIncomplete,
    isLoading,
    isError,
  } = useAdminDashboard({
    period,
    from: from || undefined,
    to: to || undefined,
  });

  const periodLabel = PERIOD_OPTIONS.find((option) => option.value === period)?.label ?? '';
  const rangeLabel =
    period === 'custom'
      ? `${from || '…'} → ${to || '…'}`
      : `${periodLabel} (${appliedPeriod.from || '…'} → ${appliedPeriod.to || '…'})`;

  // Donut tương tác: map `type` → nhãn tiếng Việt (dùng chung badge với nơi khác).
  const interactionPie = useMemo(
    () =>
      interactionTypes.map((entry) => ({
        name: INTERACTION_TYPE_BADGES[entry.type]?.label ?? entry.type,
        value: entry.value,
      })),
    [interactionTypes],
  );

  const timeSeriesChart = useMemo(
    () =>
      timeSeries.map((point) => ({
        date: formatTimePointLabel(point.date),
        interactions: point.interactions,
        ratings: point.ratings,
        comments: point.comments,
      })),
    [timeSeries],
  );

  const ratingBars = useMemo(
    () =>
      ratingDistribution.map((bucket) => ({
        label: `${bucket.rating} sao`,
        value: bucket.value,
      })),
    [ratingDistribution],
  );

  /** Backend có thể trả `click`/`like` — gom về 3 nhóm của bảng hoạt động. */
  const activityItems = useMemo<RecentActivityItem[]>(
    () =>
      recentActivity.map((item) => ({
        ...item,
        kind: (['interaction', 'rating', 'comment'].includes(item.kind)
          ? item.kind
          : 'interaction') as RecentActivityItem['kind'],
      })),
    [recentActivity],
  );

  const activityColumns = useMemo<DataTableColumn<RecentActivityItem>[]>(
    () => [
      {
        key: 'createdAt',
        header: 'Thời gian',
        className: 'w-40',
        render: (item) => formatActivityTime(item.createdAt),
      },
      {
        key: 'user',
        header: 'Người dùng',
        render: (item) => (
          <span className="line-clamp-1 max-w-40" title={item.userEmail}>
            {item.userName}
          </span>
        ),
      },
      {
        key: 'kind',
        header: 'Loại',
        className: 'w-28',
        render: (item) => (
          <Badge variant="outline" className="bg-muted text-muted-foreground border-transparent">
            {item.kindLabel}
          </Badge>
        ),
      },
      {
        key: 'movie',
        header: 'Phim',
        render: (item) => <span className="line-clamp-1 max-w-56">{item.movieTitle}</span>,
      },
      {
        key: 'detail',
        header: 'Chi tiết',
        hideOnMobile: true,
        render: (item) => <span className="line-clamp-1 max-w-64">{item.detail}</span>,
      },
    ],
    [],
  );

  /** Xuất CSV — toàn bộ số liệu aggregate đã tải theo kỳ/range hiện tại. */
  const handleExport = () => {
    const rows: Array<Record<string, string | number>> = [
      { Nhóm: 'Kỳ', Tên: rangeLabel, 'Giá trị': '', 'Chi tiết': period },
      { Nhóm: 'Chỉ số', Tên: 'Tổng số phim', 'Giá trị': totals.movies, 'Chi tiết': '' },
      { Nhóm: 'Chỉ số', Tên: 'Người dùng', 'Giá trị': totals.users, 'Chi tiết': '' },
      { Nhóm: 'Chỉ số', Tên: 'Thể loại', 'Giá trị': totals.genres, 'Chi tiết': '' },
      { Nhóm: 'Chỉ số', Tên: 'Tương tác', 'Giá trị': totals.interactions, 'Chi tiết': '' },
      { Nhóm: 'Chỉ số', Tên: 'Đánh giá', 'Giá trị': totals.ratings, 'Chi tiết': '' },
      { Nhóm: 'Chỉ số', Tên: 'Bình luận', 'Giá trị': totals.comments, 'Chi tiết': '' },
      ...timeSeries.map((point) => ({
        Nhóm: 'Chuỗi thời gian',
        Tên: point.date,
        'Giá trị': point.interactions,
        'Chi tiết': `Đánh giá: ${point.ratings}; Bình luận: ${point.comments}`,
      })),
      ...topViewed.map((item) => ({
        Nhóm: 'Top phim xem nhiều',
        Tên: item.label,
        'Giá trị': item.value,
        'Chi tiết': '',
      })),
      ...topActiveUsers.map((item) => ({
        Nhóm: 'Top người dùng hoạt động',
        Tên: item.label,
        'Giá trị': item.value,
        'Chi tiết': '',
      })),
      ...genreDistribution.map((item) => ({
        Nhóm: 'Phim theo thể loại',
        Tên: item.label,
        'Giá trị': item.value,
        'Chi tiết': '',
      })),
      ...countryDistribution.map((item) => ({
        Nhóm: 'Phim theo quốc gia',
        Tên: item.label,
        'Giá trị': item.value,
        'Chi tiết': '',
      })),
      ...interactionTypes.map((item) => ({
        Nhóm: 'Tương tác theo loại',
        Tên: item.type,
        'Giá trị': item.value,
        'Chi tiết': '',
      })),
      ...ratingDistribution.map((item) => ({
        Nhóm: 'Phân bố đánh giá',
        Tên: `${item.rating} sao`,
        'Giá trị': item.value,
        'Chi tiết': '',
      })),
      ...topRated.map((item) => ({
        Nhóm: 'Top phim đánh giá cao',
        Tên: item.label,
        'Giá trị': item.value,
        'Chi tiết': '',
      })),
      ...dataQualityIssues.map((item) => ({
        Nhóm: 'Cảnh báo dữ liệu',
        Tên: item.label,
        'Giá trị': item.count,
        'Chi tiết': item.description ?? '',
      })),
      ...recentActivity.map((item) => ({
        Nhóm: 'Hoạt động gần đây',
        Tên: `${item.kindLabel}: ${item.userName} — ${item.movieTitle}`,
        'Giá trị': formatActivityTime(item.createdAt),
        'Chi tiết': item.detail,
      })),
    ];
    downloadCsv(`dashboard-${period}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <AdminPageHeader
        title="Dashboard"
        description={`Tổng quan hoạt động hệ thống gợi ý phim — ${rangeLabel}.`}
        queryRoots={[[ADMIN_DASHBOARD_QUERY_ROOT]]}
        actions={
          <>
            <div
              role="group"
              aria-label="Kỳ thống kê"
              className="bg-muted flex flex-wrap items-center gap-1 rounded-lg p-1"
            >
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={period === option.value}
                  onClick={() => setPeriod(option.value)}
                  className={cn(
                    'cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    period === option.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              className="h-11 cursor-pointer"
              onClick={handleExport}
              disabled={isRangeIncomplete || isError}
            >
              <Download className="size-4" aria-hidden="true" />
              Xuất CSV
            </Button>
          </>
        }
      />

      {period === 'custom' ? (
        <div
          role="group"
          aria-label="Khoảng thời gian tuỳ chỉnh"
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label htmlFor="dashboard-from" className="text-muted-foreground text-xs font-medium">
              Từ ngày
            </label>
            <Input
              id="dashboard-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => setFrom(event.target.value)}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="dashboard-to" className="text-muted-foreground text-xs font-medium">
              Đến ngày
            </label>
            <Input
              id="dashboard-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => setTo(event.target.value)}
              className="h-11"
            />
          </div>
        </div>
      ) : null}

      {isRangeIncomplete ? (
        <Card>
          <CardContent>
            <EmptyState
              title="Chọn khoảng thời gian"
              description="Vui lòng chọn cả ngày bắt đầu và ngày kết thúc để tải thống kê."
            />
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Thẻ chỉ số — số liệu tổng hợp từ backend theo kỳ đã chọn */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              title="Tổng số phim"
              value={totals.movies}
              isLoading={isLoading}
              isError={isError}
              icon={<Film className="size-4" />}
            />
            <StatCard
              title="Người dùng"
              value={totals.users}
              isLoading={isLoading}
              isError={isError}
              icon={<Users className="size-4" />}
            />
            <StatCard
              title="Thể loại"
              value={totals.genres}
              isLoading={isLoading}
              isError={isError}
              icon={<Tags className="size-4" />}
            />
            <StatCard
              title="Tương tác"
              value={totals.interactions}
              isLoading={isLoading}
              isError={isError}
              icon={<Activity className="size-4" />}
            />
            <StatCard
              title="Đánh giá"
              value={totals.ratings}
              isLoading={isLoading}
              isError={isError}
              icon={<Star className="size-4" />}
            />
            <StatCard
              title="Bình luận"
              value={totals.comments}
              isLoading={isLoading}
              isError={isError}
              icon={<MessageSquare className="size-4" />}
            />
          </div>

          {/* Biểu đồ */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartFrame
              title="Xu hướng theo thời gian"
              ariaLabel="Biểu đồ đường: số tương tác, đánh giá và bình luận theo thời gian"
              isLoading={isLoading}
              isError={isError}
              isEmpty={timeSeriesChart.length === 0}
              emptyTitle="Chưa có dữ liệu theo thời gian"
              hint={rangeLabel}
              className="xl:col-span-2"
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={timeSeriesChart}
                  margin={{ top: 8, right: 16, bottom: 8, left: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="interactions"
                    name="Tương tác"
                    stroke="var(--chart-1)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="ratings"
                    name="Đánh giá"
                    stroke="var(--chart-2)"
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="comments"
                    name="Bình luận"
                    stroke="var(--chart-3)"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>

            <ChartFrame
              title="Top phim xem nhiều nhất"
              ariaLabel="Biểu đồ cột ngang: top phim có lượt xem cao nhất"
              isLoading={isLoading}
              isError={isError}
              isEmpty={topViewed.length === 0}
              emptyTitle="Chưa có phim nào"
              hint="Theo `viewCount`, tổng hợp trên toàn hệ thống"
            >
              <HorizontalBarChart data={topViewed} valueName="Lượt xem" />
            </ChartFrame>

            <ChartFrame
              title="Tương tác theo loại"
              ariaLabel="Biểu đồ tròn: phân bố tương tác theo loại"
              isLoading={isLoading}
              isError={isError}
              isEmpty={interactionPie.length === 0}
              emptyTitle="Chưa có tương tác nào"
              hint={`Trong kỳ ${rangeLabel}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={interactionPie}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {interactionPie.map((entry, index) => (
                      <Cell
                        key={entry.name}
                        fill={CHART_COLORS[index % CHART_COLORS.length]}
                        stroke="none"
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value) => Number(value).toLocaleString('vi-VN')} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartFrame>

            <ChartFrame
              title="Top người dùng hoạt động"
              ariaLabel="Biểu đồ cột ngang: người dùng có nhiều tương tác, đánh giá, bình luận nhất"
              isLoading={isLoading}
              isError={isError}
              isEmpty={topActiveUsers.length === 0}
              emptyTitle="Chưa có hoạt động nào"
              hint="Gộp tương tác + đánh giá + bình luận"
            >
              <HorizontalBarChart data={topActiveUsers} valueName="Số hoạt động" />
            </ChartFrame>

            <ChartFrame
              title="Phân bố đánh giá theo số sao"
              ariaLabel="Biểu đồ cột ngang: số lượng đánh giá theo từng mức sao"
              isLoading={isLoading}
              isError={isError}
              isEmpty={ratingBars.every((bucket) => bucket.value === 0)}
              emptyTitle="Chưa có đánh giá nào"
              hint={`Trong kỳ ${rangeLabel}`}
            >
              <HorizontalBarChart data={ratingBars} colorMode="single" valueName="Số đánh giá" />
            </ChartFrame>

            <ChartFrame
              title="Phim theo thể loại"
              ariaLabel="Biểu đồ cột ngang: số phim theo từng thể loại"
              isLoading={isLoading}
              isError={isError}
              isEmpty={genreDistribution.length === 0}
              emptyTitle="Chưa có phim gắn thể loại"
              className="xl:col-span-2"
              hint="Một phim thuộc nhiều thể loại sẽ được đếm ở từng thể loại"
            >
              <HorizontalBarChart data={genreDistribution} valueName="Số phim" />
            </ChartFrame>

            <ChartFrame
              title="Phim theo quốc gia"
              ariaLabel="Biểu đồ cột ngang: số phim theo từng quốc gia"
              isLoading={isLoading}
              isError={isError}
              isEmpty={countryDistribution.length === 0}
              emptyTitle="Chưa có dữ liệu quốc gia"
              hint="Một phim thuộc nhiều quốc gia sẽ được đếm ở từng quốc gia"
            >
              <HorizontalBarChart data={countryDistribution} valueName="Số phim" />
            </ChartFrame>

            <ChartFrame
              title="Top phim đánh giá cao"
              ariaLabel="Biểu đồ cột ngang: phim có điểm trung bình cao nhất"
              isLoading={isLoading}
              isError={isError}
              isEmpty={topRated.length === 0}
              emptyTitle="Chưa đủ dữ liệu đánh giá"
              hint="Điểm trung bình từ hệ thống"
            >
              <HorizontalBarChart
                data={topRated}
                colorMode="single"
                valueName="Điểm trung bình"
                suffix=" ★"
              />
            </ChartFrame>
          </div>

          {/* Hoạt động gần đây */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Hoạt động gần đây</CardTitle>
              <p className="text-muted-foreground text-xs">{rangeLabel}</p>
            </CardHeader>
            <CardContent className="min-w-0">
              {isLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <DataTable
                  columns={activityColumns}
                  items={activityItems}
                  rowKey={(item) => item.id}
                  empty={
                    <EmptyState
                      title="Không có hoạt động nào"
                      description="Thử chọn kỳ khác hoặc khoảng thời gian rộng hơn."
                    />
                  }
                />
              )}
            </CardContent>
          </Card>

          {/* Cảnh báo dữ liệu */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cảnh báo dữ liệu phim</CardTitle>
              <p className="text-muted-foreground text-xs">
                Tổng hợp từ backend — bấm để mở trang quản trị tương ứng.
              </p>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-24 w-full" />
              ) : dataQualityIssues.length === 0 ? (
                <EmptyState
                  title="Dữ liệu phim đầy đủ"
                  description="Không phát hiện phim thiếu thông tin."
                />
              ) : (
                <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {dataQualityIssues.map((issue) => (
                    <li key={issue.label}>
                      <Link
                        href={issue.href ?? '/admin/movies'}
                        className="hover:bg-accent/50 flex items-start gap-3 rounded-xl border p-3 transition-colors"
                      >
                        <AlertTriangle
                          className="text-muted-foreground mt-0.5 size-4 shrink-0"
                          aria-hidden="true"
                        />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="text-sm font-medium">{issue.label}</span>
                            <Badge variant="secondary" className="tabular-nums">
                              {issue.count.toLocaleString('vi-VN')}
                            </Badge>
                          </span>
                          {issue.description ? (
                            <span className="text-muted-foreground mt-1 block text-xs">
                              {issue.description}
                            </span>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-muted-foreground text-xs">
        Số liệu được tổng hợp từ backend theo kỳ/range đã chọn — không lấy mẫu ở frontend. Chọn「Làm
        mới」để invalidate toàn bộ dữ liệu dashboard.
      </p>
    </div>
  );
}
