'use client';

import { ExternalLink, Film, Pencil, Star } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Movie, MovieDetail } from '@/shared/types/movie.types';
import { formatDateTime, formatShortDate } from '@/shared/utils/formatting';
import { getPosterUrl } from './movie-poster';

export interface MovieDetailDialogProps {
  movie: Movie | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (movie: Movie) => void;
}

function displayTitle(movie: Movie): string {
  return movie.titleVi || movie.title || `#${movie.id}`;
}

function formatCount(value: unknown): string {
  const count = Number(value);
  return Number.isFinite(count) ? count.toLocaleString('vi-VN') : '—';
}

function InfoRow({ label, value }: { label: string; value?: string | number | null }) {
  const text = value === null || value === undefined || value === '' ? '—' : String(value);
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground min-w-0 truncate text-right font-medium" title={text}>
        {text}
      </span>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-muted/40 rounded-xl px-3 py-2">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-foreground text-sm font-semibold">{value}</p>
    </div>
  );
}

/**
 * Dialog xem chi tiết phim cho admin — dùng dữ liệu row (backend join sẵn
 * genres/countries/moviePeoples) và link sang trang phim công khai.
 */
export function MovieDetailDialog({ movie, open, onOpenChange, onEdit }: MovieDetailDialogProps) {
  if (!movie) return null;

  const detail = movie as MovieDetail;
  const title = displayTitle(movie);
  const posterUrl = getPosterUrl(movie.posterPath, 'w342');
  const backdropUrl = getPosterUrl(movie.backdropPath, 'w780');
  const overview = movie.overviewVi || movie.overview;
  const voteAverage = Number(movie.voteAverage);
  const genres = movie.genres ?? [];
  const countries = movie.countries ?? [];
  const peoples = (detail.moviePeoples ?? [])
    .map((item) => item.people?.fullName ?? item.people?.name)
    .filter((name): name is string => Boolean(name));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-8">{title}</DialogTitle>
          <DialogDescription>
            {movie.title && movie.title !== title ? `${movie.title} · ` : null}
            ID {String(movie.id)}
            {movie.tmdbId ? ` · TMDB ${movie.tmdbId}` : null}
            {movie.imdbId ? ` · ${movie.imdbId}` : null}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {backdropUrl ? (
            <div className="bg-muted relative h-32 w-full overflow-hidden rounded-xl sm:h-44">
              {/* eslint-disable-next-line @next/next/no-img-element -- backdrop có thể là URL ngoài TMDB do admin nhập. */}
              <img
                src={backdropUrl}
                alt={`Backdrop ${title}`}
                className="h-full w-full object-cover"
              />
            </div>
          ) : null}

          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="bg-muted relative h-48 w-32 shrink-0 self-center overflow-hidden rounded-lg sm:self-start">
              {posterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- poster có thể là URL ngoài TMDB do admin nhập.
                <img
                  src={posterUrl}
                  alt={`Poster ${title}`}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="text-muted-foreground/60 flex h-full w-full items-center justify-center">
                  <Film className="size-6" aria-hidden />
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {movie.status ? <Badge variant="secondary">{movie.status}</Badge> : null}
                {movie.releaseDate ? (
                  <Badge variant="outline">{formatShortDate(movie.releaseDate)}</Badge>
                ) : null}
                {movie.originalLanguage ? (
                  <Badge variant="outline">Ngôn ngữ: {movie.originalLanguage}</Badge>
                ) : null}
                {movie.originCountry ? (
                  <Badge variant="outline">Gốc: {movie.originCountry}</Badge>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat
                  label="Điểm đánh giá"
                  value={Number.isFinite(voteAverage) ? voteAverage.toFixed(1) : '—'}
                />
                <Stat label="Lượt bình chọn" value={formatCount(movie.voteCount)} />
                <Stat label="Lượt xem" value={formatCount(movie.viewCount)} />
                <Stat label="Lượt thích" value={formatCount(movie.likeCount)} />
                <Stat
                  label="Điểm TMDB"
                  value={
                    Number.isFinite(Number(movie.tmdbRating))
                      ? Number(movie.tmdbRating).toFixed(1)
                      : '—'
                  }
                />
                <Stat
                  label="Ngày tạo"
                  value={movie.createdAt ? formatShortDate(movie.createdAt) : '—'}
                />
              </div>

              <div className="flex flex-col gap-1">
                <InfoRow label="Ngôn ngữ gốc" value={movie.originalLanguage} />
                <InfoRow label="Quốc gia gốc" value={movie.originCountry} />
                <InfoRow
                  label="Cập nhật"
                  value={movie.updatedAt ? formatDateTime(movie.updatedAt) : '—'}
                />
              </div>
            </div>
          </div>

          {genres.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Thể loại</p>
              <div className="flex flex-wrap gap-1.5">
                {genres.map((genre) => (
                  <Badge key={genre.id} variant="outline">
                    {genre.name}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {countries.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Quốc gia</p>
              <div className="flex flex-wrap gap-1.5">
                {countries.map((country) => (
                  <Badge key={country.id} variant="secondary">
                    {country.viName}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}

          {peoples.length > 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Diễn viên / Đạo diễn</p>
              <p className="text-muted-foreground text-sm">{peoples.join(', ')}</p>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <p className="text-sm font-semibold">Mô tả</p>
            <p className="text-muted-foreground text-sm whitespace-pre-line">
              {overview || 'Chưa có mô tả.'}
            </p>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <Star className="size-4 text-yellow-500" aria-hidden />
            <span className="text-muted-foreground">
              {Number.isFinite(voteAverage)
                ? `Điểm trung bình ${voteAverage.toFixed(1)} / 10`
                : 'Chưa có điểm'}
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button asChild variant="outline" className="h-11 cursor-pointer gap-2">
            <Link href={`/movies/${movie.id}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden />
              Mở trang phim
            </Link>
          </Button>
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 cursor-pointer"
              onClick={() => onOpenChange(false)}
            >
              Đóng
            </Button>
            <Button
              type="button"
              className="h-11 cursor-pointer gap-2"
              onClick={() => onEdit(movie)}
            >
              <Pencil className="size-4" aria-hidden />
              Sửa phim
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
