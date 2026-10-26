'use client';

import { Heart } from 'lucide-react';
import { useState } from 'react';
import useInteraction from '@/hooks/tankstack/useInteraction';
import { useMovieSocket } from '@/hooks/useMovieSocket';
import { useRequireLogin } from '@/hooks/useRequireLogin';
import { cn } from '@/lib/utils';

interface MovieActionsProps {
  movieId: number | string;
  /** Kiểu hiển thị: `card` (compact cho card phim) hoặc `detail` (trang chi tiết). */
  variant?: 'card' | 'detail';
  className?: string;
}

/**
 * Nút **Yêu thích** duy nhất (like) — `POST /api/interactions` (TOGGLE).
 *
 * - `card`: chỉ hiện icon, không query thống kê/socket.
 * - `detail`: hiện thêm **số like realtime** (`movie-{id}-interaction` + stats fallback).
 * - Chưa đăng nhập → mở hộp thoại yêu cầu đăng nhập (`useRequireLogin`).
 * - Không hiển thị `score` (score là độ tin cậy tín hiệu cho AI, không phải điểm thưởng).
 */
export function MovieActions({ movieId, variant = 'card', className }: MovieActionsProps) {
  const requireLogin = useRequireLogin();
  const { keys } = useInteraction.useMyFavoriteKeys();
  const toggleInteraction = useInteraction.useToggleInteraction();
  const isDetail = variant === 'detail';

  const statsQuery = useInteraction.useInteractionStats(movieId, isDetail);

  // Số like "live" theo từng phim — tránh giữ số cũ khi đổi phim mà không cần effect.
  const movieKey = String(movieId);
  const [live, setLive] = useState<{ key: string; count: number | null }>({
    key: movieKey,
    count: null,
  });
  const likeCount = (live.key === movieKey ? live.count : null) ?? statsQuery.data?.likeCount ?? 0;

  useMovieSocket({
    movieId,
    enabled: isDetail,
    onInteraction: (payload) => {
      if (typeof payload?.likeCount === 'number') {
        setLive({ key: movieKey, count: payload.likeCount });
      }
    },
  });

  const active = keys.has(`${movieId}:like`);
  const pending =
    toggleInteraction.isPending && String(toggleInteraction.variables?.movieId) === movieKey;

  const handleToggle = () => {
    if (!requireLogin()) return;
    toggleInteraction.mutate(
      { movieId, type: 'like' },
      {
        onSuccess: (result) => {
          setLive({ key: movieKey, count: result.likeCount });
        },
      },
    );
  };

  const label = active ? 'Bỏ yêu thích' : 'Yêu thích';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        type="button"
        disabled={pending}
        aria-pressed={active}
        aria-label={label}
        title={label}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          handleToggle();
        }}
        className={cn(
          'bg-background/80 hover:bg-accent focus-visible:ring-ring inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border backdrop-blur transition-all duration-200 focus-visible:ring-2 focus-visible:outline-none active:scale-95 disabled:opacity-60',
          isDetail ? 'h-11 px-4' : 'size-9',
          active
            ? 'border-red-500/30 bg-red-500/10 text-red-500'
            : 'text-foreground border-border hover:text-foreground',
        )}
      >
        <Heart
          className={cn(isDetail ? 'size-5' : 'size-4', active && 'fill-current')}
          aria-hidden="true"
        />
        {isDetail && (
          <span className="text-sm font-medium tabular-nums">
            {likeCount.toLocaleString('vi-VN')}
          </span>
        )}
      </button>
      {isDetail && <span className="text-muted-foreground text-sm">{label}</span>}
    </div>
  );
}
