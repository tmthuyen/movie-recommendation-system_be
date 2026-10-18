'use client';

import {
  Activity,
  AlertTriangle,
  Download,
  Film,
  MessageSquare,
  RefreshCw,
  Star,
  Tags,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { DataTable, DataTableColumn } from '@/components/admin/data-table';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { PageHeader } from '@/components/common/PageHeader';
import { TYPE_BADGES } from '@/components/movie/interaction-movie-list';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { DASHBOARD_SAMPLE_LIMIT, useAdminDashboard } from '@/hooks/tankstack/admin-dashboard';
import {
  downloadCsv,
  formatActivityTime,
  RecentActivityItem,
  toCsv,
} from '@/shared/utils/admin-dashboard';
import { cn } from '@/lib/utils';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

/** Bộ lọc thời gian cho bảng hoạt động (`0` = tất cả). */
const TIME_RANGES = [
  { label: '7 ngày', value: 7 },
  { label: '30 ngày', value: 30 },
  { label: '90 ngày', value: 90 },
  { label: 'Tất cả', value: 0 },
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
  /** Ghi chú nhỏ dưới tiêu đề (đơn vị, giới hạn dữ liệu…). */
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
        <XAxis type="number" allowDecimals={colorMode === 'single' ? true : false} tick={{ fontSize: 12 }} />
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
              fill={colorMode === 'multi' ? CHART_COLORS[index % CHART_COLORS.length] : CHART_COLORS[1]}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * Dashboard admin — chỉ số lấy `pagination.total` (số liệu **chính xác**);
 * biểu đồ/bảng xếp hạng/cảnh báo dữ liệu tổng hợp phía client từ tối đa
 * `DASHBOARD_SAMPLE_LIMIT` bản ghi mới nhất mà list API trả về (backend chưa có
 * endpoint thống kê/aggregate hay filter theo thời gian).
 */
export function DashboardClient() {
  const [days, setDays] = useState(30);
  const {
    totals,
    topViewed,
    genreDistribution,
    countryDistribution,
    interactionTypes,
    ratingDistribution,
    topRated,
    topActiveUsers,
    dataQualityIssues,
    recentActivity,
    sampleSize,
    isLoading,
    isError,
    isFetching,
    refresh,
  } = useAdminDashboard({ days });

  // Donut tương tác: map `type` → nhãn tiếng Việt (dùng chung TYPE_BADGES với nơi khác).
  const interactionPie = useMemo(
    () =>
      interactionTypes.map((entry) => ({
        name: TYPE_BADGES[entry.type]?.label ?? entry.type,
        value: entry.value,
      })),
    [interactionTypes],
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
          <Badge variant="outline" className="border-transparent bg-muted text-muted-foreground">
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

  /** Xuất CSV (client-side) — gồm chỉ số tổng + các bảng xếp hạng đang hiển thị. */
  const handleExport = () => {
    const rows: Array<Record<string, string | number>> = [
      { 'Nhóm': 'Chỉ số', 'Tên': 'Tổng số phim', 'Giá trị': totals.movies },
      { 'Nhóm': 'Chỉ số', 'Tên': 'Người dùng', 'Giá trị': totals.users },
      { 'Nhóm': 'Chỉ số', 'Tên': 'Thể loại', 'Giá trị': totals.genres },
      { 'Nhóm': 'Chỉ số', 'Tên': 'Tương tác', 'Giá trị': totals.interactions },
      { 'Nhóm': 'Chỉ số', 'Tên': 'Đánh giá', 'Giá trị': totals.ratings },
      { 'Nhóm': 'Chỉ số', 'Tên': 'Bình luận', 'Giá trị': totals.comments },
      ...topViewed.map((item) => ({
        'Nhóm': 'Top phim xem nhiều',
        'Tên': item.label,
        'Giá trị': item.value,
      })),
      ...topActiveUsers.map((item) => ({
        'Nhóm': 'Top người dùng hoạt động',
        'Tên': item.label,
        'Giá trị': item.value,
      })),
      ...genreDistribution.map((item) => ({
        'Nhóm': 'Phim theo thể loại',
        'Tên': item.label,
        'Giá trị': item.value,
      })),
      ...countryDistribution.map((item) => ({
        'Nhóm': 'Phim theo quốc gia',
        'Tên': item.label,
        'Giá trị': item.value,
      })),
    ];
    downloadCsv(`dashboard-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <PageHeader
        title="Dashboard"
        description="Tổng quan hoạt động hệ thống gợi ý phim."
        actions={
          <>
            {/* Lọc thời gian — chỉ áp dụng cho bảng "Hoạt động gần đây" (xem ghi chú cuối trang) */}
            <div
              role="group"
              aria-label="Khoảng thời gian hoạt động gần đây"
              className="bg-muted flex items-center gap-1 rounded-lg p-1"
            >
              {TIME_RANGES.map((range) => (
                <button
                  key={range.value}
                  type="button"
                  aria-pressed={days === range.value}
                  onClick={() => setDays(range.value)}
                  className={cn(
                    'cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                    days === range.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {range.label}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              className="h-9 cursor-pointer"
              onClick={refresh}
              disabled={isFetching}
            >
              <RefreshCw
                className={cn('size-4', isFetching && 'animate-spin motion-reduce:animate-none')}
                aria-hidden="true"
              />
              Làm mới
            </Button>

            <Button variant="outline" className="h-9 cursor-pointer" onClick={handleExport}>
              <Download className="size-4" aria-hidden="true" />
              Xuất CSV
            </Button>
          </>
        }
      />

      {/* Thẻ chỉ số — số liệu chính xác từ `pagination.total` */}
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
          title="Top phim xem nhiều nhất"
          ariaLabel={`Biểu đồ cột ngang: top 10 phim có lượt xem cao nhất`}
          isLoading={isLoading}
          isError={isError}
          isEmpty={topViewed.length === 0}
          emptyTitle="Chưa có phim nào"
          hint="Theo `viewCount` trong mẫu dữ liệu tải về"
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
          hint={`Trên ${DASHBOARD_SAMPLE_LIMIT} tương tác gần nhất`}
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
          hint="Gộp tương tác + đánh giá + bình luận trong mẫu"
        >
          <HorizontalBarChart data={topActiveUsers} valueName="Số hoạt động" />
        </ChartFrame>

        <ChartFrame
          title="Phân bố đánh giá theo số sao"
          ariaLabel="Biểu đồ cột ngang: số lượng đánh giá theo từng mức sao 1 đến 5"
          isLoading={isLoading}
          isError={isError}
          isEmpty={ratingDistribution.every((bucket) => bucket.value === 0)}
          emptyTitle="Chưa có đánh giá nào"
          hint="Trên mẫu đánh giá tải về"
        >
          <HorizontalBarChart
            data={ratingDistribution}
            colorMode="single"
            valueName="Số đánh giá"
          />
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
          hint="Điểm trung bình, chỉ tính phim có từ 2 lượt đánh giá trong mẫu"
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
          <p className="text-muted-foreground text-xs">
            {days > 0 ? `Trong ${days} ngày gần nhất` : 'Toàn bộ'} — trích từ mẫu dữ liệu tải về
            (backend chưa hỗ trợ lọc theo thời gian).
          </p>
        </CardHeader>
        <CardContent className="min-w-0">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <DataTable
              columns={activityColumns}
              items={recentActivity}
              rowKey={(item) => item.id}
              empty={
                <EmptyState
                  title="Không có hoạt động nào"
                  description={
                    days > 0
                      ? 'Thử chọn khoảng thời gian rộng hơn (30/90 ngày hoặc Tất cả).'
                      : 'Chưa có tương tác, đánh giá hay bình luận nào.'
                  }
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
            Kiểm tra nhanh trên mẫu phim tải về — bấm để mở trang quản trị tương ứng.
          </p>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : dataQualityIssues.length === 0 ? (
            <EmptyState
              title="Dữ liệu phim đầy đủ"
              description="Không phát hiện phim thiếu thông tin trong mẫu."
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {dataQualityIssues.map((issue) => (
                <li key={issue.label}>
                  <Link
                    href={issue.href}
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
                      <span className="text-muted-foreground mt-1 block text-xs">
                        {issue.description}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Chú ý: thẻ chỉ số dùng tổng chính xác từ API phân trang (`pagination.total`). Biểu đồ, bảng
        xếp hạng và cảnh báo dữ liệu tổng hợp phía client từ {DASHBOARD_SAMPLE_LIMIT} bản ghi gần
        nhất (đang phân tích {sampleSize.toLocaleString('vi-VN')} bản ghi) — backend chưa cung cấp
        endpoint thống kê/aggregate, sort hay lọc theo thời gian.
      </p>
    </div>
  );
}
