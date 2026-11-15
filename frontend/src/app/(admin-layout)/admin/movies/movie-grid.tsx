'use client';

import { Eye, Film, Pencil, Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import type { Movie } from '@/shared/types/movie.types';
import { formatShortDate } from '@/shared/utils/formatting';
import { getPosterUrl } from './movie-poster';

export interface MovieGridProps {
  movies: Movie[];
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
  hasQuery: boolean;
  onClearQuery: () => void;
  onEdit: (movie: Movie) => void;
  onViewDetail: (movie: Movie) => void;
  onDelete: (movie: Movie) => void;
  onAdd: () => void;
  addLabel: string;
}

function MoviePoster({ path, title }: { path?: string; title: string }) {
  const url = getPosterUrl(path, 'w342');

  return (
    <div className="bg-muted relative aspect-[2/3] w-full overflow-hidden">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- poster có thể là URL ngoài TMDB do admin nhập.
        <img
          src={url}
          alt={`Poster ${title}`}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      ) : (
        <div className="text-muted-foreground/60 flex h-full w-full items-center justify-center">
          <Film className="size-10" aria-hidden />
        </div>
      )}
    </div>
  );
}

/** Lưới poster cho chế độ xem grid — cùng hành động sửa/xóa như bảng. */
export function MovieGrid({
  movies,
  isLoading,
  error,
  onRetry,
  hasQuery,
  onClearQuery,
  onEdit,
  onViewDetail,
  onDelete,
  onAdd,
  addLabel,
}: MovieGridProps) {
  if (error) {
    return <ErrorState onRetry={onRetry} />;
  }

  if (isLoading) {
    return (
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
        aria-busy="true"
        aria-label="Đang tải danh sách phim"
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="neo-surface flex flex-col overflow-hidden rounded-2xl">
            <Skeleton className="aspect-[2/3] w-full rounded-none" />
            <div className="flex flex-col gap-2 p-3">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (movies.length === 0) {
    return (
      <EmptyState
        title={hasQuery ? 'Không tìm thấy phim phù hợp' : 'Chưa có phim nào'}
        description={
          hasQuery
            ? 'Thử thay đổi từ khóa hoặc bộ lọc để tìm kết quả khác.'
            : 'Thêm phim đầu tiên để bắt đầu quản lý thư viện.'
        }
        action={
          hasQuery ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 cursor-pointer"
              onClick={onClearQuery}
            >
              Xóa tìm kiếm &amp; bộ lọc
            </Button>
          ) : (
            <Button type="button" className="h-11 cursor-pointer" onClick={onAdd}>
              {addLabel}
            </Button>
          )
        }
      />
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
      {movies.map((movie) => {
        const title = movie.titleVi || movie.title || `#${movie.id}`;
        const releaseDate = movie.releaseDate ? formatShortDate(movie.releaseDate) : null;
        const voteAverage = Number(movie.voteAverage);

        return (
          <li key={movie.id}>
            <article className="neo-surface group flex h-full flex-col overflow-hidden rounded-2xl">
              <div className="relative">
                <MoviePoster path={movie.posterPath} title={title} />
                {movie.status ? (
                  <Badge
                    variant="secondary"
                    className="bg-background/85 absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate backdrop-blur"
                  >
                    {movie.status}
                  </Badge>
                ) : null}
              </div>

              <div className="flex flex-1 flex-col gap-2 p-3">
                <h3 className="text-foreground line-clamp-2 text-sm font-semibold" title={title}>
                  {title}
                </h3>

                <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  {releaseDate ? <span>{releaseDate}</span> : null}
                  {Number.isFinite(voteAverage) ? (
                    <span className="inline-flex items-center gap-1">
                      <Star className="size-3 text-yellow-500" aria-hidden />
                      {voteAverage.toFixed(1)}
                    </span>
                  ) : null}
                </div>

                {movie.genres && movie.genres.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {movie.genres.slice(0, 3).map((genre) => (
                      <Badge key={genre.id} variant="outline" className="text-[11px]">
                        {genre.name}
                      </Badge>
                    ))}
                  </div>
                ) : null}

                <div className="mt-auto flex items-center justify-end gap-1 pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground size-11 cursor-pointer"
                    onClick={() => onViewDetail(movie)}
                    aria-label={`Xem chi tiết phim ${title}`}
                  >
                    <Eye className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-muted-foreground hover:text-foreground size-11 cursor-pointer"
                    onClick={() => onEdit(movie)}
                    aria-label={`Sửa phim ${title}`}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive size-11 cursor-pointer"
                    onClick={() => onDelete(movie)}
                    aria-label={`Xóa phim ${title}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}
