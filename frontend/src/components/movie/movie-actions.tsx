'use client';

import { Bookmark, Heart, ThumbsUp } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import useInteraction from '@/hooks/tankstack/useInteraction';
import { cn } from '@/lib/utils';
import { InteractionType } from '@/shared/types/interaction.types';
import { useAuthStore } from '@/stores/auth.store';

type ActionDef = {
  type: InteractionType;
  label: string;
  activeLabel: string;
  Icon: typeof Heart;
  activeClass: string;
};

/** Các tương tác hiển thị trên card/chi tiết (đúng `InteractionScoreMap` của backend). */
const ACTIONS: ActionDef[] = [
  {
    type: 'like',
    label: 'Thích',
    activeLabel: 'Bỏ thích',
    Icon: ThumbsUp,
    activeClass: 'bg-primary/10 text-primary border-primary/30',
  },
  {
    type: 'favorite',
    label: 'Yêu thích',
    activeLabel: 'Bỏ yêu thích',
    Icon: Heart,
    activeClass: 'bg-red-500/10 text-red-500 border-red-500/30',
  },
  {
    type: 'watchlist',
    label: 'Muốn xem',
    activeLabel: 'Bỏ khỏi muốn xem',
    Icon: Bookmark,
    activeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
  },
];

interface MovieActionsProps {
  movieId: number | string;
  /** Kiểu hiển thị: `card` (compact cho card phim) hoặc `detail` (trang chi tiết). */
  variant?: 'card' | 'detail';
  className?: string;
}

/**
 * Bộ nút tương tác nhanh (thích / yêu thích / muốn xem) — gọi `POST /api/interactions`
 * (TOGGLE). Chưa đăng nhập → chuyển `/auth/login?return-page=...`.
 */
export function MovieActions({ movieId, variant = 'card', className }: MovieActionsProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated } = useAuthStore();
  const { keys } = useInteraction.useMyFavoriteKeys();
  const toggleInteraction = useInteraction.useToggleInteraction();

  const handleToggle = (type: InteractionType) => {
    if (!isAuthenticated) {
      router.push(`/auth/login?return-page=${encodeURIComponent(pathname)}`);
      return;
    }
    toggleInteraction.mutate({ movieId, type });
  };

  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      role="group"
      aria-label="Tương tác với phim"
    >
      {ACTIONS.map(({ type, label, activeLabel, Icon, activeClass }) => {
        const active = keys.has(`${movieId}:${type}`);
        const pending =
          toggleInteraction.isPending &&
          toggleInteraction.variables?.movieId === movieId &&
          toggleInteraction.variables?.type === type;

        return (
          <button
            key={type}
            type="button"
            disabled={pending}
            aria-pressed={active}
            aria-label={active ? activeLabel : label}
            title={active ? activeLabel : label}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              handleToggle(type);
            }}
            className={cn(
              'inline-flex shrink-0 items-center justify-center rounded-full border bg-background/80 backdrop-blur transition-all duration-200 hover:bg-accent focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none active:scale-95 disabled:opacity-60',
              variant === 'card' ? 'size-9' : 'size-11',
              active ? activeClass : 'text-foreground border-border hover:text-foreground'
            )}
          >
            <Icon
              className={cn(variant === 'card' ? 'size-4' : 'size-5', active && 'fill-current')}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
}
