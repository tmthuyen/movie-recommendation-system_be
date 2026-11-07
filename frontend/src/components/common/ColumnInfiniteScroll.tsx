'use client';

import { Loader2, RefreshCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { ColumnList } from '@/components/common/ColumnList';
import { ErrorState } from '@/components/common/ErrorState';
import { Button } from '@/components/ui/button';
import { useInfiniteScrollTrigger } from '@/hooks/useInfiniteScrollTrigger';
import { cn } from '@/lib/utils';

interface ColumnInfiniteScrollProps<T> {
  items: T[];
  getKey: (item: T) => string | number;
  renderItem: (item: T) => ReactNode;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
  isFetchNextPageError?: boolean;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onRetry?: () => void;
  onRetryNextPage?: () => void;
  loadingState?: ReactNode;
  emptyState?: ReactNode;
  endText?: string;
  className?: string;
  listClassName?: string;
  itemClassName?: string;
}

/**
 * Cột danh sách + sentinel tự tải trang kế khi scroll gần cuối.
 * Dùng chung cho mọi danh sách dạng cột (similar, top rated, trending…).
 */
export function ColumnInfiniteScroll<T>({
  items,
  getKey,
  renderItem,
  hasNextPage,
  isFetchingNextPage,
  fetchNextPage,
  isFetchNextPageError = false,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  onRetryNextPage,
  loadingState,
  emptyState,
  endText = 'Đã hiển thị tất cả.',
  className,
  listClassName,
  itemClassName,
}: ColumnInfiniteScrollProps<T>) {
  const { sentinelRef } = useInfiniteScrollTrigger({
    hasNextPage,
    isFetchingNextPage,
    onLoadMore: fetchNextPage,
    disabled: isFetchNextPageError,
  });

  if (isLoading) return <>{loadingState ?? null}</>;

  if (isError && items.length === 0) {
    return (
      <ErrorState
        title="Không tải được danh sách"
        description={errorMessage ?? 'Không thể tải dữ liệu. Vui lòng thử lại.'}
        onRetry={onRetry}
      />
    );
  }

  if (items.length === 0) return <>{emptyState ?? null}</>;

  return (
    <div className={cn('space-y-3', className)}>
      <ColumnList
        items={items}
        getKey={getKey}
        renderItem={renderItem}
        className={listClassName}
        itemClassName={itemClassName}
      />

      {isFetchingNextPage ? (
        <div
          role="status"
          aria-live="polite"
          className="text-muted-foreground flex items-center justify-center gap-2 py-3 text-sm"
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
          <Button variant="outline" size="sm" onClick={onRetryNextPage}>
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
