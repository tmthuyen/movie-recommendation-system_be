'use client';

import { Clapperboard } from 'lucide-react';
import { useMemo } from 'react';
import { DataPagination } from '@/components/common/DataPagination';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import useMovie from '@/hooks/tankstack/useMovie';
import { useMovieSearchFilters } from '@/hooks/useMovieSearchFilters';
import { countActiveMovieFilters } from '@/shared/utils/movie-search-query';
import { MovieFilters } from './movie-filters';
import { MovieGrid, MovieGridSkeleton } from './movie-grid';

export function MovieList() {
  const { filters, apiParams, updateFilters } = useMovieSearchFilters();
  const hasActiveFilter = useMemo(() => countActiveMovieFilters(filters) > 0, [filters]);

  const { data, isLoading, isError, isFetching, refetch } = useMovie.useSearchMovies(
    apiParams,
    1000 * 60,
  );

  const totalPages = Math.max(1, data?.totalPages ?? 1);
  const movies = data?.movies ?? [];

  return (
    <div className="space-y-4">
      <MovieFilters />

      {isLoading ? (
        <MovieGridSkeleton />
      ) : isError ? (
        <ErrorState
          title="Không thể tải danh sách phim"
          description="Vui lòng thử lại sau giây lát."
          onRetry={() => refetch()}
        />
      ) : movies.length === 0 ? (
        <EmptyState
          title="Không tìm thấy phim phù hợp"
          description={
            hasActiveFilter
              ? 'Thử xoá bớt bộ lọc hoặc tìm với từ khoá khác.'
              : 'Hệ thống chưa có phim để hiển thị.'
          }
          icon={Clapperboard}
        />
      ) : (
        <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <MovieGrid movies={movies} />
        </div>
      )}

      <div className="space-y-1 pt-2">
        <DataPagination
          page={filters.page}
          totalPages={totalPages}
          onPageChange={(page) => updateFilters({ page, resetPage: false })}
          className={totalPages <= 1 ? 'pointer-events-none opacity-50' : undefined}
        />
        {!isLoading && data ? (
          <p className="text-muted-foreground text-center text-xs">
            Hiển thị {movies.length} / {data.total} phim (trang {filters.page}/{totalPages})
          </p>
        ) : null}
      </div>
    </div>
  );
}
