'use client';

import { Star } from 'lucide-react';
import { useEffect, useState } from 'react';
import useRating from '@/hooks/tankstack/useRating';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { useMovieSocket } from '@/hooks/useMovieSocket';
import { cn } from '@/lib/utils';
import useInteraction from '@/hooks/tankstack/useInteraction';
import { Genre } from '@/shared/types/api.types';
import { toInteractionGenres } from '@/shared/utils/movie';

interface MovieRatingProps {
  movieId: number;
  voteAverage: number;
  voteCount: number;
  genres?: Genre[];
}

/**
 * Widget đánh giá sao trên trang chi tiết:
 * - Hiển thị `voteAverage`/`voteCount` hiện tại (cập nhật realtime qua WS
 *   `movie-{id}-rating` → `payload.movieStats`).
 * - Nút 1–5 sao (aria-label rõ ràng) → `POST /api/ratings` (JWT);
 *   chưa đăng nhập → hiện hộp thoại yêu cầu đăng nhập (`useRequireLogin`).
 */
export function MovieRating({ movieId, voteAverage, voteCount, genres }: MovieRatingProps) {
  const requireLogin = useRequireLogin();

  const [myRating, setMyRating] = useState<number | null>(null);

  // Lây chỉ 1 lần khi vào trang
  const { data: myInteractionsWithMovie } = useInteraction.useMyInteractionsWithMovie(movieId);

  const [stats, setStats] = useState({
    voteAverage: Number(voteAverage) || 0,
    voteCount: Number(voteCount) || 0,
  });

  useEffect(() => {
    setStats({
      voteAverage: Number(voteAverage) || 0,
      voteCount: Number(voteCount) || 0,
    });
  }, [voteAverage, voteCount]);

  const [hoverStar, setHoverStar] = useState(0);

  const createRating = useRating.useCreateRating(movieId);

  // Realtime: cập nhật voteAverage/voteCount khi user khác đánh giá (và cả chính user)
  useMovieSocket({
    movieId,
    onRating: (payload) => {
      const next = payload?.movieStats;
      if (next) {
        setStats({
          voteAverage: Number(next.voteAverage) || 0,
          voteCount: Number(next.voteCount) || 0,
        });
        return;
      }
      // // Also handle direct fields if present
      // if (
      //   typeof (payload as any)?.voteAverage === 'number' ||
      //   typeof (payload as any)?.voteCount === 'number'
      // ) {
      //   setStats({
      //     voteAverage: Number((payload as any).voteAverage) || stats.voteAverage,
      //     voteCount: Number((payload as any).voteCount) || stats.voteCount,
      //   });
      // }
    },
  });

  const handleRate = (value: number) => {
    if (!requireLogin()) return;
    createRating.mutate(
      { rating: value, genres: toInteractionGenres(genres) },
      {
        onSuccess: (data) => {
          console.log('Rating created successfully:', data);

          setMyRating(data.rating);
        },
      },
    );
  };

  const displayStar = hoverStar || myRating || myInteractionsWithMovie?.rating?.rating || 0;

  return (
    <section
      aria-label="Đánh giá phim"
      className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-xl border p-4"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-extrabold tabular-nums">
          {Number(stats.voteAverage || 0).toFixed(1)}
        </span>
        <div className="text-muted-foreground text-sm">
          <div className="text-foreground mb-0.5 flex items-center gap-0.5" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <Star
                key={index}
                className={cn(
                  'size-4',
                  index < displayStar
                    ? 'fill-yellow-400 text-yellow-400'
                    : 'text-muted-foreground/40 fill-muted-foreground/20',
                )}
              />
            ))}
          </div>
          <span>{stats.voteCount.toLocaleString('vi-VN')} lượt đánh giá</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground mr-1 text-sm">Đánh giá của bạn:</span>
        {Array.from({ length: 5 }).map((_, index) => {
          const value = index + 1;
          return (
            <button
              key={value}
              type="button"
              disabled={createRating.isPending}
              aria-label={`Đánh giá ${value} trên 5 sao`}
              onClick={() => handleRate(value)}
              onMouseEnter={() => setHoverStar(value)}
              onMouseLeave={() => setHoverStar(0)}
              onFocus={() => setHoverStar(value)}
              onBlur={() => setHoverStar(0)}
              className={cn(
                'hover:bg-accent focus-visible:ring-ring cursor-pointer rounded p-1.5 transition-all focus-visible:ring-2 focus-visible:outline-none active:scale-90 disabled:cursor-not-allowed disabled:opacity-50',
                value <= displayStar
                  ? 'text-yellow-500'
                  : 'text-muted-foreground hover:text-muted-foreground/80',
              )}
            >
              <Star className="size-6" />
            </button>
          );
        })}
      </div>
    </section>
  );
}
