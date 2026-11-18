'use client';

import { Loader2, RefreshCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { useInfiniteScrollTrigger } from '@/hooks/useInfiniteScrollTrigger';
import type { Movie } from '@/shared/types/movie.types';
import { MovieGrid, MovieGridSkeleton } from './movie-grid';

interface MovieInfiniteGridProps {
  movies: Movie[];
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  isLoading?: boolean;
  isError?: boolean;
  errorTitle?: string;
  errorMessage?: string;
  isFetchNextPageError?: boolean;
  onRetry?: () => void;
  onRetryNextPage?: () => void;
  emptyState?: ReactNode;
  endText?: string;
  skeletonCount?: number;
}

/**
 * Grid phim kèm sentinel tải trang kế khi cuộn gần cuối.
 * Nhận danh sách phim đã gộp và callback tải trang kế từ `useInfiniteQuery`.
 */
export function MovieInfiniteGrid({
  movies,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  isLoading = false,
  isError = false,
  errorTitle = 'Không tải được danh sách phim',
  errorMessage,
  isFetchNextPageError = false,
  onRetry,
  onRetryNextPage,
  emptyState,
  endText = 'Bạn đã xem hết danh sách phim.',
  skeletonCount = 12,
}: MovieInfiniteGridProps) {
  const { sentinelRef } = useInfiniteScrollTrigger({
    hasNextPage,
    isFetchingNextPage,
    onLoadMore: fetchNextPage,
    disabled: isFetchNextPageError,
  });

  if (isLoading) return <MovieGridSkeleton items={skeletonCount} />;

  if (isError && movies.length === 0) {
    return (
      <ErrorState
        title={errorTitle}
        description={errorMessage ?? 'Không thể tải dữ liệu. Vui lòng thử lại.'}
        onRetry={onRetry}
      />
    );
  }

  if (movies.length === 0) return <>{emptyState ?? null}</>;

  return (
    <div className="space-y-4">
      <MovieGrid movies={movies} motion="reveal" />

      {isFetchingNextPage ? (
        <div
          role="status"
          aria-live="polite"
          className="text-muted-foreground flex items-center justify-center gap-2 py-2 text-sm"
        >
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Đang tải thêm phim…
        </div>
      ) : null}

      {isFetchNextPageError ? (
        <div
          role="alert"
          className="border-border/70 bg-muted/30 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center"
        >
          <p className="text-muted-foreground text-sm">Không tải thêm được phim.</p>
          <Button variant="outline" className="h-11 cursor-pointer" onClick={onRetryNextPage}>
            <RefreshCcw aria-hidden="true" />
            Thử lại
          </Button>
        </div>
      ) : null}

      {!hasNextPage && !isFetchNextPageError ? (
        <p className="text-muted-foreground py-2 text-center text-xs">{endText}</p>
      ) : null}

      {hasNextPage && !isFetchNextPageError ? (
        <div ref={sentinelRef} aria-hidden="true" className="h-px w-full" />
      ) : null}
    </div>
  );
}
