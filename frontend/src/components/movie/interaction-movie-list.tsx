'use client';

import { Activity, Clock, Film, Heart } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { DataPagination } from '@/components/common/DataPagination';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import useInteraction from '@/hooks/tankstack/useInteraction';
import { cn } from '@/lib/utils';
import { Interaction, InteractionType } from '@/shared/types/interaction.types';
import { INTERACTION_TYPE_BADGES } from '@/shared/utils/interaction';
import { getMovieTitle, getPosterUrl, getReleaseYear } from '@/shared/utils/movie';

const PAGE_LIMIT = 12;

type ActivityTab = 'all' | InteractionType;

const ACTIVITY_TABS: Array<{ label: string; value: ActivityTab }> = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Đã xem', value: 'click' },
  { label: 'Yêu thích', value: 'like' },
  { label: 'Đánh giá', value: 'rating' },
  { label: 'Bình luận', value: 'comment' },
];

/** `types` gửi cho backend; `all` để trống để backend lấy cả bốn loại. */
const TAB_TYPES: Record<ActivityTab, InteractionType[] | undefined> = {
  all: undefined,
  click: ['click'],
  like: ['like'],
  rating: ['rating'],
  comment: ['comment'],
};

function formatDate(value?: Date | string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('vi-VN');
}

function InteractionRow({
  interaction,
  showDetail = false,
}: {
  interaction: Interaction;
  showDetail?: boolean;
}) {
  const movie = interaction.movie;
  if (!movie) return null;

  const badge = INTERACTION_TYPE_BADGES[interaction.type] ?? INTERACTION_TYPE_BADGES.click;
  const poster = getPosterUrl(movie.posterPath || movie.backdropPath);
  const title = getMovieTitle(movie);
  const year = getReleaseYear(movie.releaseDate);
  const dateLabel = formatDate(interaction.createdAt);
  const ratingScore = Number(interaction.score ?? 0);
  const comment = interaction.content?.trim();

  return (
    <li>
      <Link
        href={`/movies/${movie.id}`}
        className="group bg-card hover:border-primary/40 hover:bg-accent/50 flex items-center gap-4 rounded-xl border p-3 transition-colors"
      >
        <div className="bg-muted relative h-24 w-16 shrink-0 overflow-hidden rounded-lg">
          {poster ? (
            <Image src={poster} alt="" fill sizes="64px" className="object-cover" />
          ) : (
            <Film
              className="text-muted-foreground absolute top-1/2 left-1/2 size-6 -translate-x-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="group-hover:text-primary truncate font-semibold transition-colors">
            {title}
            {year ? (
              <span className="text-muted-foreground ml-1.5 text-sm font-normal">({year})</span>
            ) : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
            <span
              className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', badge.className)}
            >
              {badge.label}
            </span>
            {showDetail && interaction.type === 'rating' ? (
              <span
                className="text-xs font-medium text-amber-500 tabular-nums"
                aria-label={`Đánh giá ${ratingScore} trên 5`}
              >
                ★ {ratingScore}/5
              </span>
            ) : null}
            {dateLabel ? <span className="text-muted-foreground">{dateLabel}</span> : null}
          </div>
          {showDetail && interaction.type === 'comment' && comment ? (
            <p className="text-muted-foreground mt-1 line-clamp-2 text-xs" title={comment}>
              “{comment}”
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function InteractionListSkeleton() {
  return (
    <ul className="space-y-3" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <li key={index} className="bg-card flex items-center gap-4 rounded-xl border p-3">
          <Skeleton className="h-24 w-16 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-24" />
          </div>
        </li>
      ))}
    </ul>
  );
}

const SOURCE_CONFIG = {
  history: {
    emptyIcon: Clock,
    emptyTitle: 'Chưa có lịch sử xem',
    emptyDescription: 'Bạn chưa xem bộ phim nào. Hãy khám phá phim ngay!',
  },
  favorites: {
    emptyIcon: Heart,
    emptyTitle: 'Chưa có phim yêu thích',
    emptyDescription: 'Hãy yêu thích một bộ phim để chúng xuất hiện tại đây.',
  },
} as const;

interface MyInteractionListProps {
  /**
   * Nguồn dữ liệu:
   * - `history` — `GET /my-history` (type=click)
   * - `favorites` — `GET /my-favorites` (type=like)
   * - `activities` — `GET /my-activities` với tabs click/like/rating/comment
   */
  source: 'history' | 'favorites' | 'activities';
}

/**
 * Danh sách tương tác cá nhân dùng chung cho `/my-history`, `/my-favorites`
 * và `/my-interactions` (tabs đầy đủ). Hàng phim gồm poster + tên + badge loại
 * tương tác + ngày; tab activities hiển thị thêm điểm rating và nội dung comment.
 */
export function MyInteractionList({ source }: MyInteractionListProps) {
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<ActivityTab>('all');
  const isActivities = source === 'activities';
  const types = TAB_TYPES[tab];

  // Gọi cả ba hook (rules của React Hooks) — hook không dùng sẽ `enabled=false`.
  const historyQuery = useInteraction.useMyHistory(page, PAGE_LIMIT, source === 'history');
  const favoritesQuery = useInteraction.useMyFavoritesPaged(
    page,
    PAGE_LIMIT,
    source === 'favorites',
  );
  const activitiesQuery = useInteraction.useMyActivities(
    page,
    PAGE_LIMIT,
    types ?? [],
    isActivities,
  );

  const query = isActivities
    ? activitiesQuery
    : source === 'history'
      ? historyQuery
      : favoritesQuery;

  const { data, isLoading, isError, isFetching, refetch } = query;
  const items = data?.items ?? [];
  const pagination = data?.pagination;

  const handlePageChange = (nextPage: number) => {
    setPage(nextPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabChange = (nextTab: ActivityTab) => {
    setTab(nextTab);
    setPage(1);
  };

  const legacyConfig = source === 'favorites' ? SOURCE_CONFIG.favorites : SOURCE_CONFIG.history;
  const tabLabel = ACTIVITY_TABS.find((item) => item.value === tab)?.label ?? 'Tất cả';
  const config = isActivities
    ? {
        emptyIcon: Activity,
        emptyTitle: `Chưa có tương tác ${tabLabel.toLowerCase()}`,
        emptyDescription: 'Tương tác của bạn với phim sẽ xuất hiện tại đây.',
      }
    : legacyConfig;

  let content: React.ReactNode;
  if (isLoading) {
    content = <InteractionListSkeleton />;
  } else if (isError) {
    content = (
      <ErrorState
        title="Không thể tải danh sách"
        description="Vui lòng kiểm tra kết nối và thử lại."
        onRetry={() => refetch()}
      />
    );
  } else if (items.length === 0) {
    content = (
      <EmptyState
        icon={config.emptyIcon}
        title={config.emptyTitle}
        description={config.emptyDescription}
        action={
          <Button asChild size="sm" className="cursor-pointer">
            <Link href="/movies">Khám phá phim</Link>
          </Button>
        }
      />
    );
  } else {
    content = (
      <div className="flex w-full flex-col gap-6">
        <ul
          className={cn('space-y-3 transition-opacity', isFetching ? 'opacity-60' : 'opacity-100')}
        >
          {items.map((interaction) => (
            <InteractionRow
              key={interaction.id}
              interaction={interaction}
              showDetail={isActivities}
            />
          ))}
        </ul>

        {pagination ? (
          <DataPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={handlePageChange}
            disabled={isFetching}
            ariaLabel="Phân trang danh sách"
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-6">
      {isActivities ? (
        <div
          role="tablist"
          aria-label="Loại tương tác"
          className="bg-muted flex flex-wrap items-center gap-1 rounded-lg p-1"
        >
          {ACTIVITY_TABS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="tab"
              aria-selected={tab === item.value}
              onClick={() => handleTabChange(item.value)}
              className={cn(
                'cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                tab === item.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
      {content}
    </div>
  );
}
