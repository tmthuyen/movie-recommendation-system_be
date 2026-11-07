'use client';

import { Sparkles } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ColumnInfiniteScroll } from '@/components/common/ColumnInfiniteScroll';
import { EmptyState } from '@/components/common/EmptyState';
import { MovieCard } from '@/components/movie/movie-card';
import { MovieColumnLoading } from '@/components/movie/movie-column';
import {
  similarInfiniteQueryKey,
  useGetSimilarMoviesInfinite,
} from '@/hooks/tankstack/useRecommendation';
import { parseAxiosError } from '@/lib/axiosClient';
import type { MovieWithSimilarScore } from '@/shared/types/movie.types';

const SIMILAR_PAGE_SIZE = 12;

interface SimilarMoviesInfiniteProps {
  movieId: number;
  /** Giữ prop để tương thích component cũ; hiện chưa dùng. */
  genres?: { id: number | string; name: string }[];
}

/** Tab "Phim tương tự" với infinite scroll theo cursor. */
export function SimilarMoviesInfinite({ movieId }: SimilarMoviesInfiniteProps) {
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
  } = useGetSimilarMoviesInfinite(movieId, { limit: SIMILAR_PAGE_SIZE });

  const movies = useMemo(() => {
    const seen = new Set<MovieWithSimilarScore['id']>();
    return (data?.pages ?? [])
      .flatMap((page) => page.result)
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
      queryKey: similarInfiniteQueryKey(movieId, SIMILAR_PAGE_SIZE),
    });
  }, [parsedError, movieId, queryClient]);

  return (
    <section aria-label="Phim tương tự" className="space-y-3">
      <div className="from-primary/10 via-background to-background border-border/60 relative overflow-hidden rounded-2xl border bg-gradient-to-br p-3 shadow-sm sm:p-4">
        <div
          aria-hidden="true"
          className="bg-primary/10 pointer-events-none absolute -top-16 -right-16 size-40 rounded-full blur-3xl"
        />

        <div className="relative space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="bg-primary/10 text-primary inline-flex size-8 shrink-0 items-center justify-center rounded-full">
                <Sparkles className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Gợi ý dành riêng cho bạn</h3>
                <p className="text-muted-foreground text-xs">Cuộn để tải thêm phim tương tự</p>
              </div>
            </div>

            {movies.length > 0 ? (
              <span className="bg-background/80 text-muted-foreground shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium">
                {movies.length} phim
              </span>
            ) : null}
          </div>

          <ColumnInfiniteScroll
            items={movies}
            getKey={(movie) => movie.id}
            renderItem={(movie) => <MovieCard movie={movie} />}
            isLoading={isLoading}
            isError={isError}
            errorMessage={parsedError?.message}
            loadingState={<MovieColumnLoading items={6} />}
            emptyState={
              <EmptyState
                title="Chưa có phim tương tự"
                description="Hệ thống chưa tìm thấy phim phù hợp để gợi ý."
                icon={Sparkles}
              />
            }
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
            fetchNextPage={() => void fetchNextPage()}
            onRetry={() => void refetch()}
            onRetryNextPage={() => void fetchNextPage()}
            endText="Bạn đã xem hết danh sách phim tương tự."
          />
        </div>
      </div>
    </section>
  );
}
