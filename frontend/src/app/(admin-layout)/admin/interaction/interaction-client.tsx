'use client';

import { useEffect, useMemo, useState } from 'react';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminDeleteDialog } from '@/components/admin/data-view/admin-delete-dialog';
import { AdminTablePage } from '@/components/admin/data-view/admin-table-page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  adminMovies,
  useAdminComments,
  useAdminInteractions,
  useAdminRatings,
  useDeleteComment,
  useDeleteInteraction,
  useDeleteRating,
} from '@/hooks/tankstack/admin';
import { useServerTable } from '@/hooks/use-server-table';
import type { Comment } from '@/shared/types/comment.types';
import type { Interaction } from '@/shared/types/interaction.types';
import type { Movie } from '@/shared/types/movie.types';
import type { Rating } from '@/shared/types/rating.types';
import {
  createCommentFilterFields,
  createInteractionFilterFields,
  createRatingFilterFields,
} from './interaction-filter-fields';
import {
  createCommentColumns,
  createInteractionColumns,
  createRatingColumns,
} from './interaction-columns';

const EMPTY_RATINGS: Rating[] = [];
const EMPTY_COMMENTS: Comment[] = [];
const EMPTY_INTERACTIONS: Interaction[] = [];
const EMPTY_MOVIES: Movie[] = [];
const DEFAULT_SORTING = [{ id: 'createdAt', desc: true }];
/** Tab Like/Click chỉ hiển thị tương tác `like` và `click`. */
const LIKE_CLICK_TAB_FILTERS = ['type:in:like,click'];
const OPTION_LIST_PARAMS = { page: 1, limit: 100 };

/** Option phim cho filter quan hệ (hiển thị tên, gửi id). */
function useMovieFilterOptions() {
  const moviesQuery = adminMovies.useList(OPTION_LIST_PARAMS);
  const movies = moviesQuery.data?.items ?? EMPTY_MOVIES;

  return useMemo(
    () =>
      movies.map((movie) => ({
        value: String(movie.id),
        label: movie.titleVi || movie.title || `#${movie.id}`,
      })),
    [movies],
  );
}

/** Tab Đánh giá — danh sách read-only, chỉ thao tác xóa. */
function RatingTab() {
  const table = useServerTable({ initialPageSize: 10, initialSorting: DEFAULT_SORTING });
  const { clampPageIndex } = table;

  const movieOptions = useMovieFilterOptions();
  const filterFields = useMemo(() => createRatingFilterFields(movieOptions), [movieOptions]);

  const ratingsQuery = useAdminRatings(table.params);
  const ratings = ratingsQuery.data?.items ?? EMPTY_RATINGS;
  const total = ratingsQuery.data?.pagination?.total ?? 0;

  useEffect(() => {
    clampPageIndex(total);
  }, [clampPageIndex, total]);

  const removeRating = useDeleteRating();
  const [deleteTarget, setDeleteTarget] = useState<Rating | null>(null);

  const columns = useMemo(
    () => createRatingColumns({ onDelete: (rating) => setDeleteTarget(rating) }),
    [],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeRating.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Lỗi đã được toast trong mutation — giữ dialog mở để user thử lại.
    }
  };

  return (
    <AdminTablePage
      table={table}
      columns={columns}
      data={ratings}
      total={total}
      isLoading={ratingsQuery.isLoading}
      isFetching={ratingsQuery.isFetching}
      error={ratingsQuery.error}
      onRetry={() => void ratingsQuery.refetch()}
      searchPlaceholder="Tìm theo người dùng, phim, nội dung…"
      searchLabel="Tìm kiếm đánh giá"
      filterFields={filterFields}
      entityLabel="đánh giá"
      emptyDescription="Chưa có đánh giá nào trong hệ thống."
    >
      <AdminDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="Xóa đánh giá?"
        description={
          <>
            Đánh giá{' '}
            <span className="text-foreground font-medium">
              {deleteTarget ? `${deleteTarget.rating} sao` : 'này'}
            </span>{' '}
            sẽ bị xóa vĩnh viễn và không thể khôi phục.
          </>
        }
        onConfirm={handleDelete}
        deleting={removeRating.isPending}
      />
    </AdminTablePage>
  );
}

/** Tab Bình luận — danh sách read-only, chỉ thao tác xóa. */
function CommentTab() {
  const table = useServerTable({ initialPageSize: 10, initialSorting: DEFAULT_SORTING });
  const { clampPageIndex } = table;

  const movieOptions = useMovieFilterOptions();
  const filterFields = useMemo(() => createCommentFilterFields(movieOptions), [movieOptions]);

  const commentsQuery = useAdminComments(table.params);
  const comments = commentsQuery.data?.items ?? EMPTY_COMMENTS;
  const total = commentsQuery.data?.pagination?.total ?? 0;

  useEffect(() => {
    clampPageIndex(total);
  }, [clampPageIndex, total]);

  const removeComment = useDeleteComment();
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null);

  const columns = useMemo(
    () => createCommentColumns({ onDelete: (comment) => setDeleteTarget(comment) }),
    [],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeComment.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Lỗi đã được toast trong mutation — giữ dialog mở để user thử lại.
    }
  };

  return (
    <AdminTablePage
      table={table}
      columns={columns}
      data={comments}
      total={total}
      isLoading={commentsQuery.isLoading}
      isFetching={commentsQuery.isFetching}
      error={commentsQuery.error}
      onRetry={() => void commentsQuery.refetch()}
      searchPlaceholder="Tìm theo người dùng, phim, nội dung…"
      searchLabel="Tìm kiếm bình luận"
      filterFields={filterFields}
      entityLabel="bình luận"
      emptyDescription="Chưa có bình luận nào trong hệ thống."
    >
      <AdminDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="Xóa bình luận?"
        description={
          <>
            Bình luận của{' '}
            <span className="text-foreground font-medium">
              {deleteTarget?.user?.fullName ?? deleteTarget?.user?.email ?? 'người dùng này'}
            </span>{' '}
            sẽ bị xóa vĩnh viễn. Các phản hồi trực thuộc (nếu có) không bị xóa theo.
          </>
        }
        onConfirm={handleDelete}
        deleting={removeComment.isPending}
      />
    </AdminTablePage>
  );
}

/** Tab Like / Click — tương tác yêu thích và lượt xem. */
function LikeClickTab() {
  const table = useServerTable({
    initialPageSize: 10,
    initialSorting: DEFAULT_SORTING,
    lockedFilters: LIKE_CLICK_TAB_FILTERS,
  });
  const { clampPageIndex } = table;

  const movieOptions = useMovieFilterOptions();
  const actionsFilterFields = useMemo(
    () => createInteractionFilterFields(movieOptions),
    [movieOptions],
  );

  const interactionsQuery = useAdminInteractions(table.params);
  const interactions = interactionsQuery.data?.items ?? EMPTY_INTERACTIONS;
  const total = interactionsQuery.data?.pagination?.total ?? 0;

  useEffect(() => {
    clampPageIndex(total);
  }, [clampPageIndex, total]);

  const removeInteraction = useDeleteInteraction();
  const [deleteTarget, setDeleteTarget] = useState<Interaction | null>(null);

  const columns = useMemo(
    () => createInteractionColumns({ onDelete: (interaction) => setDeleteTarget(interaction) }),
    [],
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await removeInteraction.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Lỗi đã được toast trong mutation — giữ dialog mở để user thử lại.
    }
  };

  return (
    <AdminTablePage
      table={table}
      columns={columns}
      data={interactions}
      total={total}
      isLoading={interactionsQuery.isLoading}
      isFetching={interactionsQuery.isFetching}
      error={interactionsQuery.error}
      onRetry={() => void interactionsQuery.refetch()}
      searchPlaceholder="Tìm theo người dùng, phim, loại tương tác…"
      searchLabel="Tìm kiếm tương tác"
      filterFields={actionsFilterFields}
      entityLabel="tương tác"
      emptyDescription="Chưa có tương tác nào trong hệ thống."
    >
      <AdminDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        title="Xóa tương tác?"
        description={
          <>
            Tương tác của{' '}
            <span className="text-foreground font-medium">
              {deleteTarget?.user?.fullName ?? deleteTarget?.user?.email ?? 'người dùng này'}
            </span>{' '}
            sẽ bị xóa vĩnh viễn và không thể khôi phục.
          </>
        }
        onConfirm={handleDelete}
        deleting={removeInteraction.isPending}
      />
    </AdminTablePage>
  );
}

interface InteractionClientProps {
  title?: string;
  description?: string;
}

const INTERACTION_QUERY_ROOTS = [
  ['admin-interactions'],
  ['admin-ratings'],
  ['admin-comments'],
  ['admin-movies'],
] as const;

/** Trang Tương tác: 3 tab độc lập (đánh giá / bình luận / like-click). */
export function InteractionClient({
  title = 'Tương tác',
  description = 'Theo dõi tương tác, đánh giá và bình luận của người dùng',
}: InteractionClientProps = {}) {
  return (
    <div className="flex h-full w-full flex-col gap-4">
      <AdminPageHeader
        title={title}
        description={description}
        queryRoots={INTERACTION_QUERY_ROOTS}
      />
      <Tabs defaultValue="ratings" className="gap-4">
        <TabsList
          className="h-auto! w-full justify-start gap-1 overflow-x-auto sm:w-fit"
          aria-label="Loại tương tác"
        >
          <TabsTrigger value="ratings" className="cursor-pointer px-4">
            Đánh giá
          </TabsTrigger>
          <TabsTrigger value="comments" className="cursor-pointer px-4">
            Bình luận
          </TabsTrigger>
          <TabsTrigger value="like-click" className="cursor-pointer px-4">
            Like / Click
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ratings">
          <RatingTab />
        </TabsContent>
        <TabsContent value="comments">
          <CommentTab />
        </TabsContent>
        <TabsContent value="like-click">
          <LikeClickTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
