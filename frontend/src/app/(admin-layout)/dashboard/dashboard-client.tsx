'use client';

import { Activity, Film, Tags, Users } from 'lucide-react';
import type { ReactNode } from 'react';
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
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TYPE_BADGES } from '@/components/movie/interaction-movie-list';
import { adminGenres, adminMovies, adminUsers, useAdminInteractions } from '@/hooks/tankstack/admin';
import { getMovieTitle } from '@/shared/utils/movie';
import { cn } from '@/lib/utils';

const CHART_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

const SAMPLE_LIMIT = 100;
const TOP_COUNT = 10;

interface StatCardProps {
  title: string;
  value?: number;
  isLoading: boolean;
  isError?: boolean;
  icon: ReactNode;
}

/** Thẻ chỉ số — hiển thị nhãn + số cụ thể (không dùng màu làm duy nhất). */
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
  children: ReactNode;
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
  children,
  className,
}: ChartFrameProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
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

/**
 * Dashboard admin — thẻ chỉ số lấy `pagination.total` từ các list API hiện có;
 * biểu đồ tổng hợp client-side từ 100 bản ghi đầu tiên
 * (backend chưa có endpoint thống kê riêng — xem chú ý ở cuối trang).
 */
export function DashboardClient() {
  const moviesQuery = adminMovies.useList({ page: 1, limit: SAMPLE_LIMIT });
  const usersStat = adminUsers.useList({ page: 1, limit: 1 });
  const genresStat = adminGenres.useList({ page: 1, limit: 1 });
  const moviesStat = adminMovies.useList({ page: 1, limit: 1 });
  const interactionsStat = useAdminInteractions({ page: 1, limit: 1 });
  const interactionsSample = useAdminInteractions({ page: 1, limit: SAMPLE_LIMIT });

  const movies = moviesQuery.data?.items ?? [];

  // Top phim theo lượt xem (backend không sort → sắp xếp client-side).
  const topViewed = [...movies]
    .sort((left, right) => Number(right.viewCount ?? 0) - Number(left.viewCount ?? 0))
    .slice(0, TOP_COUNT)
    .map((movie) => ({
      label: getMovieTitle(movie),
      value: Number(movie.viewCount ?? 0),
    }));

  // Phim theo thể loại (top 10).
  const genreCounts = new Map<string, number>();
  movies.forEach((movie) =>
    movie.genres?.forEach((genre) =>
      genreCounts.set(genre.name, (genreCounts.get(genre.name) ?? 0) + 1)
    )
  );
  const genreDistribution = [...genreCounts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, TOP_COUNT);

  // Tương tác theo loại (reused TYPE_BADGES để cùng nhãn với nơi khác).
  const typeCounts = new Map<string, number>();
  (interactionsSample.data?.items ?? []).forEach((interaction) =>
    typeCounts.set(interaction.type, (typeCounts.get(interaction.type) ?? 0) + 1)
  );
  const interactionDistribution = [...typeCounts.entries()].map(([type, value]) => ({
    name: TYPE_BADGES[type]?.label ?? type,
    value,
  }));

  return (
    <div className="flex w-full flex-col gap-4">
      {/* Thẻ chỉ số */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Tổng số phim"
          value={moviesStat.data?.pagination.total}
          isLoading={moviesStat.isLoading}
          isError={moviesStat.isError}
          icon={<Film className="size-4" />}
        />
        <StatCard
          title="Người dùng"
          value={usersStat.data?.pagination.total}
          isLoading={usersStat.isLoading}
          isError={usersStat.isError}
          icon={<Users className="size-4" />}
        />
        <StatCard
          title="Thể loại"
          value={genresStat.data?.pagination.total}
          isLoading={genresStat.isLoading}
          isError={genresStat.isError}
          icon={<Tags className="size-4" />}
        />
        <StatCard
          title="Tương tác"
          value={interactionsStat.data?.pagination.total}
          isLoading={interactionsStat.isLoading}
          isError={interactionsStat.isError}
          icon={<Activity className="size-4" />}
        />
      </div>

      {/* Biểu đồ */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartFrame
          title="Top phim xem nhiều nhất"
          ariaLabel={`Biểu đồ cột ngang: top ${TOP_COUNT} phim có lượt xem cao nhất`}
          isLoading={moviesQuery.isLoading}
          isError={moviesQuery.isError}
          isEmpty={topViewed.length === 0}
          emptyTitle="Chưa có phim nào"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topViewed} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="label"
                width={150}
                tick={{ fontSize: 12 }}
                interval={0}
              />
              <Tooltip
                formatter={(value) => [Number(value).toLocaleString('vi-VN'), 'Lượt xem']}
                cursor={{ fill: 'var(--muted)' }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {topViewed.map((entry, index) => (
                  <Cell
                    key={`${entry.label}-${index}`}
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>

        <ChartFrame
          title="Tương tác theo loại"
          ariaLabel="Biểu đồ tròn: phân bố tương tác theo loại"
          isLoading={interactionsSample.isLoading}
          isError={interactionsSample.isError}
          isEmpty={interactionDistribution.length === 0}
          emptyTitle="Chưa có tương tác nào"
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={interactionDistribution}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={2}
              >
                {interactionDistribution.map((entry, index) => (
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
          title="Phim theo thể loại"
          ariaLabel={`Biểu đồ cột ngang: số phim theo từng thể loại, tối đa ${TOP_COUNT} thể loại`}
          isLoading={moviesQuery.isLoading}
          isError={moviesQuery.isError}
          isEmpty={genreDistribution.length === 0}
          emptyTitle="Chưa có phim gắn thể loại"
          className="xl:col-span-2"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={genreDistribution}
              layout="vertical"
              margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
            >
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="label"
                width={150}
                tick={{ fontSize: 12 }}
                interval={0}
              />
              <Tooltip
                formatter={(value) => [Number(value).toLocaleString('vi-VN'), 'Số phim']}
                cursor={{ fill: 'var(--muted)' }}
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} fill="var(--chart-2)" />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </div>

      <p className={cn('text-muted-foreground text-xs')}>
        Chú ý: thẻ chỉ số dùng tổng từ API phân trang; biểu đồ tổng hợp phía client từ{' '}
        {SAMPLE_LIMIT} bản ghi đầu tiên (backend chưa cung cấp endpoint thống kê riêng).
      </p>
    </div>
  );
}
