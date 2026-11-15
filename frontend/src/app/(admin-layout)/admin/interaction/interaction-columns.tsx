'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminTableFeatures } from '@/components/admin/data-view/features';
import type { AdminColumnDef } from '@/components/admin/data-view/types';
import type { Comment } from '@/shared/types/comment.types';
import type { Interaction, InteractionType } from '@/shared/types/interaction.types';
import type { Rating } from '@/shared/types/rating.types';
import { formatDateTime } from '@/shared/utils/formatting';

const ratingHelper = createColumnHelper<AdminTableFeatures, Rating>();
const commentHelper = createColumnHelper<AdminTableFeatures, Comment>();
const interactionHelper = createColumnHelper<AdminTableFeatures, Interaction>();

interface UserSummary {
  fullName?: string;
  email?: string;
}

function userName(user?: UserSummary): string {
  return user?.fullName || user?.email || '—';
}

function movieTitle(movie?: { title?: string; titleVi?: string }): string {
  return movie?.titleVi || movie?.title || '—';
}

function renderDeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="text-destructive hover:bg-destructive/10 hover:text-destructive size-11 cursor-pointer"
      onClick={onClick}
      aria-label={label}
    >
      <Trash2 className="size-4" aria-hidden />
    </Button>
  );
}

export interface RatingColumnsOptions {
  onDelete: (rating: Rating) => void;
}

/** Cột bảng đánh giá — sort field khớp whitelist backend. */
export function createRatingColumns({ onDelete }: RatingColumnsOptions): AdminColumnDef<Rating>[] {
  return ratingHelper.columns([
    ratingHelper.accessor('id', {
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground font-mono text-xs">{String(getValue())}</span>
      ),
    }),
    ratingHelper.display({
      id: 'user',
      header: 'Người đánh giá',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-foreground truncate font-medium">
            {userName(row.original.user)}
          </span>
          <span className="text-muted-foreground truncate text-xs">{row.original.user?.email}</span>
        </div>
      ),
    }),
    ratingHelper.display({
      id: 'movie',
      header: 'Phim',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-foreground line-clamp-2 max-w-[240px] text-sm">
          {movieTitle(row.original.movie)}
        </span>
      ),
    }),
    ratingHelper.accessor('rating', {
      header: 'Số sao',
      cell: ({ getValue }) => (
        <span className="inline-flex items-center gap-1 text-sm font-medium">
          <Star className="size-3.5 text-yellow-500" aria-hidden />
          {getValue()}
        </span>
      ),
    }),
    ratingHelper.accessor('content', {
      header: 'Nội dung',
      enableSorting: false,
      cell: ({ getValue }) => {
        const content = getValue();
        return content ? (
          <span className="text-muted-foreground line-clamp-2 max-w-[320px] text-sm">
            {content}
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-sm">—</span>
        );
      },
    }),
    ratingHelper.accessor('createdAt', {
      header: 'Ngày đánh giá',
      cell: ({ getValue }) => {
        const createdAt = getValue();
        return createdAt ? (
          <span className="text-muted-foreground text-sm">{formatDateTime(createdAt)}</span>
        ) : (
          <span className="text-muted-foreground/60 text-sm">—</span>
        );
      },
    }),
    ratingHelper.display({
      id: 'actions',
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const rating = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            {renderDeleteButton({
              label: `Xóa đánh giá của ${userName(rating.user)}`,
              onClick: () => onDelete(rating),
            })}
          </div>
        );
      },
    }),
  ]);
}

export interface CommentColumnsOptions {
  onDelete: (comment: Comment) => void;
}

/** Cột bảng bình luận — sort field khớp whitelist backend. */
export function createCommentColumns({
  onDelete,
}: CommentColumnsOptions): AdminColumnDef<Comment>[] {
  return commentHelper.columns([
    commentHelper.accessor('id', {
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground font-mono text-xs">{String(getValue())}</span>
      ),
    }),
    commentHelper.display({
      id: 'user',
      header: 'Người bình luận',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-foreground truncate font-medium">
            {userName(row.original.user)}
          </span>
          <span className="text-muted-foreground truncate text-xs">{row.original.user?.email}</span>
        </div>
      ),
    }),
    commentHelper.display({
      id: 'movie',
      header: 'Phim',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-foreground line-clamp-2 max-w-[200px] text-sm">
          {movieTitle(row.original.movie)}
        </span>
      ),
    }),
    commentHelper.accessor('content', {
      header: 'Nội dung',
      enableSorting: false,
      cell: ({ getValue }) => (
        <span className="text-muted-foreground line-clamp-3 max-w-[360px] text-sm">
          {getValue()}
        </span>
      ),
    }),
    commentHelper.accessor('parentId', {
      header: 'Trả lời',
      enableSorting: false,
      cell: ({ getValue }) => {
        const parentId = getValue();
        return parentId ? (
          <Badge variant="outline" className="font-mono text-[11px]">
            #{String(parentId)}
          </Badge>
        ) : (
          <span className="text-muted-foreground/60 text-sm">Bình luận gốc</span>
        );
      },
    }),
    commentHelper.accessor('createdAt', {
      header: 'Ngày bình luận',
      cell: ({ getValue }) => {
        const createdAt = getValue();
        return createdAt ? (
          <span className="text-muted-foreground text-sm">{formatDateTime(createdAt)}</span>
        ) : (
          <span className="text-muted-foreground/60 text-sm">—</span>
        );
      },
    }),
    commentHelper.display({
      id: 'actions',
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const comment = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            {renderDeleteButton({
              label: `Xóa bình luận của ${userName(comment.user)}`,
              onClick: () => onDelete(comment),
            })}
          </div>
        );
      },
    }),
  ]);
}

const INTERACTION_TYPE_LABEL: Record<InteractionType, string> = {
  like: 'Yêu thích',
  click: 'Lượt xem',
  rating: 'Đánh giá',
  comment: 'Bình luận',
};

export interface InteractionColumnsOptions {
  onDelete: (interaction: Interaction) => void;
}

/** Cột bảng tương tác (like/click) — sort field khớp whitelist backend. */
export function createInteractionColumns({
  onDelete,
}: InteractionColumnsOptions): AdminColumnDef<Interaction>[] {
  return interactionHelper.columns([
    interactionHelper.accessor('id', {
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground font-mono text-xs">{String(getValue())}</span>
      ),
    }),
    interactionHelper.display({
      id: 'user',
      header: 'Người dùng',
      enableSorting: false,
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <span className="text-foreground truncate font-medium">
            {userName(row.original.user)}
          </span>
          <span className="text-muted-foreground truncate text-xs">{row.original.user?.email}</span>
        </div>
      ),
    }),
    interactionHelper.display({
      id: 'movie',
      header: 'Phim',
      enableSorting: false,
      cell: ({ row }) => (
        <span className="text-foreground line-clamp-2 max-w-[240px] text-sm">
          {movieTitle(row.original.movie)}
        </span>
      ),
    }),
    interactionHelper.accessor('type', {
      header: 'Loại',
      cell: ({ getValue }) => {
        const type = getValue();
        return (
          <Badge variant={type === 'like' ? 'default' : 'secondary'}>
            {INTERACTION_TYPE_LABEL[type] ?? type}
          </Badge>
        );
      },
    }),
    interactionHelper.accessor('score', {
      header: 'Điểm',
      cell: ({ getValue }) => {
        const score = getValue();
        return typeof score === 'number' ? (
          <span className="text-muted-foreground text-sm">{score.toFixed(2)}</span>
        ) : (
          <span className="text-muted-foreground/60 text-sm">—</span>
        );
      },
    }),
    interactionHelper.accessor('createdAt', {
      header: 'Ngày tương tác',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground text-sm">{formatDateTime(getValue())}</span>
      ),
    }),
    interactionHelper.display({
      id: 'actions',
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const interaction = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            {renderDeleteButton({
              label: `Xóa tương tác của ${userName(interaction.user)}`,
              onClick: () => onDelete(interaction),
            })}
          </div>
        );
      },
    }),
  ]);
}
