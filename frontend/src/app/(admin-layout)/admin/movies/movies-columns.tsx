'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { Eye, Film, Pencil, Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminTableFeatures } from '@/components/admin/data-view/features';
import type { AdminColumnDef } from '@/components/admin/data-view/types';
import type { Movie } from '@/shared/types/movie.types';
import { formatShortDate } from '@/shared/utils/formatting';
import { getPosterUrl } from './movie-poster';

const helper = createColumnHelper<AdminTableFeatures, Movie>();

export interface MovieColumnsOptions {
  onEdit: (movie: Movie) => void;
  onViewDetail: (movie: Movie) => void;
  onDelete: (movie: Movie) => void;
}

/** Tiêu đề hiển thị — ưu tiên tên tiếng Việt, fallback tên gốc. */
function displayTitle(movie: Movie): string {
  return movie.titleVi || movie.title || `#${movie.id}`;
}

/** `bigint`/`numeric` của Postgres có thể về dạng string → luôn ép số. */
function formatCount(value: unknown): string {
  const count = Number(value);
  return Number.isFinite(count) ? count.toLocaleString('vi-VN') : '—';
}

function emptyCell() {
  return <span className="text-muted-foreground/60 text-sm">—</span>;
}

/** Cột bảng phim — sort field khớp whitelist backend. */
export function createMovieColumns({
  onEdit,
  onViewDetail,
  onDelete,
}: MovieColumnsOptions): AdminColumnDef<Movie>[] {
  return helper.columns([
    helper.accessor('id', {
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground font-mono text-xs">{String(getValue())}</span>
      ),
    }),
    helper.accessor('title', {
      header: 'Phim',
      cell: ({ row }) => {
        const movie = row.original;
        const posterUrl = getPosterUrl(movie.posterPath, 'w200');
        const title = displayTitle(movie);

        return (
          <div className="flex min-w-0 items-center gap-3">
            <div className="bg-muted relative h-14 w-10 shrink-0 overflow-hidden rounded-md">
              {posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- poster có thể là URL ngoài TMDB do admin nhập.
                <img
                  src={posterUrl}
                  alt={`Poster ${title}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-muted-foreground/60 flex h-full w-full items-center justify-center">
                  <Film className="size-4" aria-hidden />
                </div>
              )}
            </div>
            <div className="flex min-w-0 flex-col gap-0.5">
              <span
                className="text-foreground line-clamp-2 max-w-[280px] font-medium"
                title={title}
              >
                {title}
              </span>
              {movie.title && movie.title !== title ? (
                <span className="text-muted-foreground truncate text-xs">{movie.title}</span>
              ) : null}
            </div>
          </div>
        );
      },
    }),
    helper.accessor('overview', {
      header: 'Mô tả',
      enableSorting: false,
      cell: ({ row }) => {
        const overview = row.original.overviewVi || row.original.overview;
        if (!overview) return emptyCell();
        return (
          <p className="text-muted-foreground line-clamp-2 max-w-[260px] text-xs" title={overview}>
            {overview}
          </p>
        );
      },
    }),
    helper.display({
      id: 'genres',
      header: 'Thể loại',
      enableSorting: false,
      cell: ({ row }) => {
        const genres = row.original.genres ?? [];
        if (genres.length === 0) return emptyCell();
        return (
          <div className="flex max-w-[220px] flex-wrap gap-1">
            {genres.slice(0, 3).map((genre) => (
              <Badge key={genre.id} variant="outline" className="text-[11px]">
                {genre.name}
              </Badge>
            ))}
            {genres.length > 3 ? (
              <Badge variant="secondary" className="text-[11px]">
                +{genres.length - 3}
              </Badge>
            ) : null}
          </div>
        );
      },
    }),
    helper.display({
      id: 'countries',
      header: 'Quốc gia',
      enableSorting: false,
      cell: ({ row }) => {
        const countries = row.original.countries ?? [];
        if (countries.length === 0) return emptyCell();
        return (
          <span
            className="text-muted-foreground block max-w-[180px] truncate text-sm"
            title={countries.map((country) => country.viName).join(', ')}
          >
            {countries.map((country) => country.viName).join(', ')}
          </span>
        );
      },
    }),
    helper.accessor('releaseDate', {
      header: 'Phát hành',
      cell: ({ getValue }) => {
        const releaseDate = getValue();
        return releaseDate ? (
          <span className="text-muted-foreground text-sm">{formatShortDate(releaseDate)}</span>
        ) : (
          emptyCell()
        );
      },
    }),
    helper.accessor('originalLanguage', {
      header: 'Ngôn ngữ',
      enableSorting: false,
      cell: ({ getValue }) => {
        const language = getValue();
        return language ? (
          <span className="text-muted-foreground font-mono text-xs">{language}</span>
        ) : (
          emptyCell()
        );
      },
    }),
    helper.accessor('voteAverage', {
      header: 'Điểm',
      cell: ({ getValue }) => {
        const voteAverage = Number(getValue());
        if (!Number.isFinite(voteAverage)) return emptyCell();
        return (
          <span className="inline-flex items-center gap-1 text-sm font-medium">
            <Star className="size-3.5 text-yellow-500" aria-hidden />
            {voteAverage.toFixed(1)}
          </span>
        );
      },
    }),
    helper.accessor('voteCount', {
      header: 'Bình chọn',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground text-sm">{formatCount(getValue())}</span>
      ),
    }),
    helper.accessor('viewCount', {
      header: 'Lượt xem',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground text-sm">{formatCount(getValue())}</span>
      ),
    }),
    helper.accessor('likeCount', {
      header: 'Lượt thích',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground text-sm">{formatCount(getValue())}</span>
      ),
    }),
    helper.accessor('status', {
      header: 'Trạng thái',
      enableSorting: false,
      cell: ({ getValue }) => {
        const status = getValue();
        return status ? (
          <Badge variant="secondary" className="max-w-[140px] truncate">
            {status}
          </Badge>
        ) : (
          emptyCell()
        );
      },
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const movie = row.original;
        const title = displayTitle(movie);
        return (
          <div className="flex items-center justify-end gap-1">
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
        );
      },
    }),
  ]);
}
