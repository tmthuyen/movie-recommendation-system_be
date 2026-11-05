'use client';

import { Eye, Film, Star } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import Image from 'next/image';
import Link from 'next/link';
import { MovieActions } from './movie-actions';
import { MOTION_DURATION, MOTION_EASE, cardVariants } from '@/lib/motion';
import { Movie } from '@/shared/types/movie.types';
import { getMovieTitle, getPosterUrl, getReleaseYear } from '@/shared/utils/movie';

interface MovieCardProps {
  movie: Movie;
  /** Ẩn bộ nút tương tác (dùng cho các card không cần actions). */
  hideActions?: boolean;
}

/**
 * Card phim dùng chung (danh sách `/movies`, trang chủ…).
 *
 * - Click toàn card → `/movies/[id]` (stretched link, `z-10`).
 * - Hover / focus (bàn phím) → overlay hiện thêm thông tin (thể loại, mô tả,
 *   năm, lượt xem). Thiết bị touch (`hover: none`) không dựa vào hover.
 * - Nút Yêu thích (like) nằm trên overlay, `z-20`,
 *   chặn click xuyên xuống stretched link.
 */
export function MovieCard({ movie, hideActions = false }: MovieCardProps) {
  const reduceMotion = useReducedMotion();
  const poster = getPosterUrl(movie.backdropPath || movie.posterPath);
  const title = getMovieTitle(movie);
  const year = getReleaseYear(movie.releaseDate);
  const rating = typeof movie.voteAverage === 'number' ? movie.voteAverage : 0;
  const views = Number(movie.viewCount) || 0;
  const likes = Number(movie.likeCount) || 0;
  const overview = movie.overviewVi || movie.overview || '';
  const genres = (movie.genres ?? []).slice(0, 3);

  return (
    <motion.article
      variants={cardVariants}
      transition={{ duration: MOTION_DURATION, ease: MOTION_EASE }}
      whileHover={reduceMotion ? undefined : { y: -4, scale: 1.02 }}
      className="group bg-card text-card-foreground focus-within:ring-ring relative flex flex-col overflow-hidden rounded-lg border shadow-sm transition-shadow duration-300 focus-within:ring-2 hover:shadow-lg"
    >
      <div className="bg-muted relative aspect-[6/3] w-full overflow-hidden">
        {poster ? (
          <>
            {/* <img
              src={getPosterUrl(movie.posterPath || movie.backdropPath)}
              alt={title}
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            dưedwdsdcc êcwdcewc */}
            <Image
              src={poster}
              alt={title}
              width={500}
              height={500}
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16vw"
              className="h-full w-full object-cover object-center"
            />
          </>
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Film className="size-10" />
          </div>
        )}

        {rating > 0 && (
          <span className="bg-background/85 text-foreground absolute top-2 right-2 z-20 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold shadow-sm backdrop-blur">
            <Star className="size-3 fill-current text-yellow-500" aria-hidden="true" />
            {rating.toFixed(1)}
          </span>
        )}

        {/* Overlay thông tin khi hover/focus — ẩn trên thiết bị không có hover */}
        <div
          aria-hidden="true"
          className="from-background/95 via-background/75 absolute inset-0 z-10 flex flex-col justify-end gap-1.5 bg-gradient-to-t to-transparent p-3 opacity-0 transition-opacity duration-300 group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:hidden"
        >
          {genres.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {genres.map((genre) => (
                <span
                  key={genre.id}
                  className="bg-secondary text-secondary-foreground rounded-full px-2 py-0.5 text-[11px] font-medium"
                >
                  {genre.name}
                </span>
              ))}
            </div>
          )}
          {overview && (
            <p className="text-muted-foreground line-clamp-3 text-xs leading-relaxed">{overview}</p>
          )}
          <div className="text-muted-foreground flex items-center gap-3 text-xs">
            {year && <span>{year}</span>}
            <span className="inline-flex items-center gap-1">
              <Eye className="size-3" aria-hidden="true" />
              {views.toLocaleString('vi-VN')} lượt xem
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 px-2 py-4">
        <h3 className="line-clamp-1 text-sm leading-snug font-bold">{movie.titleVi}</h3>
        <h3 className="text-muted-foreground line-clamp-1 text-sm leading-snug">{movie.title}</h3>
        {/* <div className="mt-auto flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">{year || 'Đang cập nhật'}</p>
          {!hideActions && (
            <MovieActions originalLikeCount={likes} movieId={movie.id} variant="card" />
          )}
        </div> */}
      </div>

      {/* Stretched link: click toàn card → chi tiết phim */}
      <Link
        href={`/movies/${movie.id}`}
        title={title}
        aria-label={title}
        className="focus-visible:ring-ring absolute inset-0 z-10 rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      />
    </motion.article>
  );
}
