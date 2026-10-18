'use client';

import { useState } from 'react';
import { CrudTableSkeleton, DataTable, DataTableColumn } from '@/components/admin/data-table';
import { CrudDeleteDialog } from '@/components/admin/delete-dialog';
import { DataPagination } from '@/components/common/DataPagination';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TYPE_BADGES } from '@/components/movie/interaction-movie-list';
import {
  useAdminComments,
  useAdminInteractions,
  useAdminRatings,
  useDeleteComment,
  useDeleteInteraction,
  useDeleteRating,
} from '@/hooks/tankstack/admin';
import { Comment } from '@/shared/types/comment.types';
import { Interaction } from '@/shared/types/interaction.types';
import { Rating } from '@/shared/types/rating.types';
import { formatDateTime } from '@/shared/utils/formatting';
import { getMovieTitle } from '@/shared/utils/movie';
import { cn } from '@/lib/utils';

type Tab = 'interactions' | 'ratings' | 'comments';

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'interactions', label: 'Tương tác' },
  { value: 'ratings', label: 'Đánh giá' },
  { value: 'comments', label: 'Bình luận' },
];

interface DeleteTarget {
  id: string;
  label: string;
  kind: Tab;
}

/** Người hiển thị — join `user` từ backend. */
function renderUser(user?: { fullName?: string; email?: string }) {
  return user?.fullName || user?.email || <span className="text-muted-foreground">—</span>;
}

/** Phim hiển thị — join `movie` từ backend. */
function renderMovie(movie?: { title?: string; titleVi?: string }) {
  if (!movie) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="line-clamp-1 max-w-56">
      {getMovieTitle({ title: movie.title ?? '', titleVi: movie.titleVi })}
    </span>
  );
}

function renderCreatedAt(value?: string | Date) {
  return value ? formatDateTime(value) : '—';
}

const INTERACTION_COLUMNS: DataTableColumn<Interaction>[] = [
  { key: 'user', header: 'Người dùng', render: (item) => renderUser(item.user) },
  { key: 'movie', header: 'Phim', render: (item) => renderMovie(item.movie) },
  {
    key: 'type',
    header: 'Loại',
    className: 'w-32',
    render: (item) => {
      const badge = TYPE_BADGES[item.type];
      return (
        <Badge variant="outline" className={cn('border-transparent', badge?.className)}>
          {badge?.label ?? item.type}
        </Badge>
      );
    },
  },
  {
    key: 'score',
    header: 'Điểm',
    className: 'w-20',
    hideOnMobile: true,
    render: (item) => <span className="tabular-nums">{item.score}</span>,
  },
  { key: 'createdAt', header: 'Thời gian', className: 'w-40', render: (item) => renderCreatedAt(item.createdAt) },
];

const RATING_COLUMNS: DataTableColumn<Rating>[] = [
  { key: 'user', header: 'Người dùng', render: (item) => renderUser(item.user) },
  { key: 'movie', header: 'Phim', render: (item) => renderMovie(item.movie) },
  {
    key: 'rating',
    header: 'Điểm',
    className: 'w-24',
    render: (item) => (
      <span className="tabular-nums font-medium">
        {item.rating}
        <span className="text-muted-foreground font-normal">/5</span>
      </span>
    ),
  },
  { key: 'createdAt', header: 'Thời gian', className: 'w-40', render: (item) => renderCreatedAt(item.createdAt) },
];

const COMMENT_COLUMNS: DataTableColumn<Comment>[] = [
  { key: 'user', header: 'Người dùng', render: (item) => renderUser(item.user) },
  { key: 'movie', header: 'Phim', render: (item) => renderMovie(item.movie) },
  {
    key: 'content',
    header: 'Nội dung',
    render: (item) => <p className="line-clamp-2 max-w-md whitespace-pre-wrap">{item.content}</p>,
  },
  { key: 'createdAt', header: 'Thời gian', className: 'w-40', render: (item) => renderCreatedAt(item.createdAt) },
];

/**
 * Trang admin Interaction — 3 danh sách read-only (Tương tác / Đánh giá / Bình luận)
 * chuyển bằng tab segment; xóa từng bản ghi qua `CrudDeleteDialog` dùng chung.
 * `enabled` theo tab để không fetch thừa; backend không filter theo type.
 */
export function InteractionClient() {
  const [tab, setTab] = useState<Tab>('interactions');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const limit = 10;
  const interactions = useAdminInteractions({ page, limit, enabled: tab === 'interactions' });
  const ratings = useAdminRatings({ page, limit, enabled: tab === 'ratings' });
  const comments = useAdminComments({ page, limit, enabled: tab === 'comments' });

  const deleteInteraction = useDeleteInteraction();
  const deleteRating = useDeleteRating();
  const deleteComment = useDeleteComment();

  const active = tab === 'interactions' ? interactions : tab === 'ratings' ? ratings : comments;
  const isDeleting =
    deleteInteraction.isPending || deleteRating.isPending || deleteComment.isPending;

  const switchTab = (next: Tab) => {
    setTab(next);
    setPage(1);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.kind === 'interactions') {
        await deleteInteraction.mutateAsync(deleteTarget.id);
      } else if (deleteTarget.kind === 'ratings') {
        await deleteRating.mutateAsync(deleteTarget.id);
      } else {
        await deleteComment.mutateAsync(deleteTarget.id);
      }
      setDeleteTarget(null);
    } catch {
      // Đã toast trong mutation onError — giữ dialog mở.
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Loại dữ liệu">
        {TABS.map((item) => (
          <Button
            key={item.value}
            role="tab"
            aria-selected={tab === item.value}
            variant={tab === item.value ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => switchTab(item.value)}
          >
            {item.label}
          </Button>
        ))}
      </div>

      {active.isLoading ? (
        <CrudTableSkeleton />
      ) : active.isError ? (
        <ErrorState
          title="Không thể tải dữ liệu"
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={() => active.refetch()}
        />
      ) : (
        <>
          {tab === 'interactions' ? (
            <DataTable
              columns={INTERACTION_COLUMNS}
              items={interactions.data?.items ?? []}
              rowKey={(item) => item.id}
              onDelete={(item) =>
                setDeleteTarget({
                  id: String(item.id),
                  label: item.user?.fullName || item.user?.email || `#${item.id}`,
                  kind: 'interactions',
                })
              }
              empty={<EmptyState title="Chưa có tương tác nào" description="Chưa có bản ghi nào." />}
            />
          ) : null}
          {tab === 'ratings' ? (
            <DataTable
              columns={RATING_COLUMNS}
              items={ratings.data?.items ?? []}
              rowKey={(item) => item.id}
              onDelete={(item) =>
                setDeleteTarget({
                  id: String(item.id),
                  label: item.user?.fullName || item.user?.email || `#${item.id}`,
                  kind: 'ratings',
                })
              }
              empty={<EmptyState title="Chưa có đánh giá nào" description="Chưa có bản ghi nào." />}
            />
          ) : null}
          {tab === 'comments' ? (
            <DataTable
              columns={COMMENT_COLUMNS}
              items={comments.data?.items ?? []}
              rowKey={(item) => item.id}
              onDelete={(item) =>
                setDeleteTarget({
                  id: String(item.id),
                  label: item.user?.fullName || item.user?.email || `#${item.id}`,
                  kind: 'comments',
                })
              }
              empty={<EmptyState title="Chưa có bình luận nào" description="Chưa có bản ghi nào." />}
            />
          ) : null}

          {active.data ? (
            <DataPagination
              page={active.data.pagination.page}
              totalPages={active.data.pagination.totalPages}
              total={active.data.pagination.total}
              onPageChange={setPage}
              disabled={active.isFetching}
              ariaLabel="Phân trang dữ liệu tương tác"
            />
          ) : null}
        </>
      )}

      <CrudDeleteDialog
        target={deleteTarget}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        isPending={isDeleting}
        entityLabel="bản ghi"
      />
    </div>
  );
}
