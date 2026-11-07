import { useEffect, useRef } from 'react';

interface UseInfiniteScrollTriggerOptions {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** Tạm dừng auto-load (ví dụ trang kế đang lỗi và cần người dùng bấm thử lại). */
  disabled?: boolean;
  /** Khoảng cách trước sentinel để bắt đầu tải. */
  rootMargin?: string;
  threshold?: number;
}

/**
 * Gắn IntersectionObserver vào sentinel ở cuối danh sách.
 * Trả về ref cần gắn vào một element cao 1px cuối list.
 */
export function useInfiniteScrollTrigger({
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  disabled = false,
  rootMargin = '240px 0px',
  threshold = 0.01,
}: UseInfiniteScrollTriggerOptions) {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  const loadingRef = useRef(false);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!isFetchingNextPage) loadingRef.current = false;
  }, [isFetchingNextPage]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasNextPage || isFetchingNextPage || disabled) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || loadingRef.current) return;
        loadingRef.current = true;
        onLoadMoreRef.current();
      },
      { rootMargin, threshold },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, disabled, rootMargin, threshold]);

  return { sentinelRef };
}
