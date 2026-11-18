'use client';

import { Lock, Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/EmptyState';
import { MovieInfiniteGrid } from '@/components/movie/movie-infinite-grid';
import { MovieGridSkeleton } from '@/components/movie/movie-grid';
import { Button } from '@/components/ui/button';
import { forYouInfiniteQueryKey, useForYouInfinite } from '@/hooks/tankstack/useRecommendation';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { parseAxiosError } from '@/lib/axiosClient';
import type { Movie } from '@/shared/types/movie.types';
import { useAuthStore } from '@/stores/auth.store';

const FOR_YOU_PAGE_SIZE = 12;

/** Danh sách phim gợi ý cá nhân hoá cho trang `/for-you`. */
export function ForYouList() {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuthStore();
  const requireLogin = useRequireLogin();
  const queryClient = useQueryClient();
  const expiredHandledRef = useRef(false);

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    refetch,
  } = useForYouInfinite(FOR_YOU_PAGE_SIZE);

  const movies = useMemo<Movie[]>(() => {
    const seen = new Set<Movie['id']>();
    return (data?.pages ?? [])
      .flatMap((page) => page.result ?? [])
      .filter((movie) => {
        if (seen.has(movie.id)) return false;
        seen.add(movie.id);
        return true;
      });
  }, [data]);

  const parsedError = useMemo(() => (error ? parseAxiosError(error) : null), [error]);

  useEffect(() => {
    if (!parsedError) {
      expiredHandledRef.current = false;
      return;
    }
    if (expiredHandledRef.current || parsedError.statusCode !== 409) return;

    expiredHandledRef.current = true;
    toast.info('Danh sách gợi ý đã thay đổi, đang tải lại từ đầu.');
    void queryClient.resetQueries({
      queryKey: forYouInfiniteQueryKey(FOR_YOU_PAGE_SIZE),
    });
  }, [parsedError, queryClient]);

  if (isAuthLoading) return <MovieGridSkeleton />;

  if (!isAuthenticated) {
    return (
      <EmptyState
        icon={Lock}
        title="Đăng nhập để xem gợi ý dành cho bạn"
        description="Hệ thống cá nhân hoá gợi ý dựa trên lịch sử xem, đánh giá và phim yêu thích của bạn."
        action={
          <Button className="h-11 cursor-pointer" onClick={() => requireLogin()}>
            Đăng nhập
          </Button>
        }
      />
    );
  }

  return (
    <MovieInfiniteGrid
      movies={movies}
      isLoading={isLoading}
      isError={isError}
      errorMessage={parsedError?.message}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      isFetchNextPageError={isFetchNextPageError}
      fetchNextPage={() => void fetchNextPage()}
      onRetry={() => void refetch()}
      onRetryNextPage={() => void fetchNextPage()}
      emptyState={
        <EmptyState
          icon={Sparkles}
          title="Chưa có gợi ý cho bạn"
          description="Hãy xem và yêu thích vài bộ phim để hệ thống hiểu sở thích của bạn."
        />
      }
      endText="Bạn đã xem hết danh sách gợi ý."
    />
  );
}
