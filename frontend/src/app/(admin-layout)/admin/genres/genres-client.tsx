'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { genreApi } from '@/apis/genre.api';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminDeleteDialog } from '@/components/admin/data-view/admin-delete-dialog';
import { AdminFormDialog } from '@/components/admin/data-view/admin-form-dialog';
import type {
  AdminFormField,
  AdminFormValues,
} from '@/components/admin/data-view/admin-form-schema';
import { AdminTablePage } from '@/components/admin/data-view/admin-table-page';
import { adminGenres } from '@/hooks/tankstack/admin';
import { useServerTable } from '@/hooks/use-server-table';
import { parseAxiosError } from '@/lib/axiosClient';
import type { Genre } from '@/shared/types/api.types';
import { GENRE_FILTER_FIELDS } from './genre-filter-fields';
import { createGenreColumns } from './genres-columns';

/** Identity ổn định cho fallback data (tránh reset row model mỗi render). */
const EMPTY_GENRES: Genre[] = [];
const DEFAULT_SORTING = [{ id: 'name', desc: false }];

const GENRE_FORM_FIELDS: AdminFormField[] = [
  {
    name: 'name',
    label: 'Tên thể loại',
    required: true,
    placeholder: 'VD: Hành động',
    wide: true,
  },
  {
    name: 'enName',
    label: 'Tên tiếng Anh',
    placeholder: 'VD: Action',
    wide: true,
  },
];

interface GenresClientProps {
  title?: string;
  description?: string;
}

export function GenresClient({
  title = 'Thể loại',
  description = 'Quản lý các nhóm thể loại phim',
}: GenresClientProps = {}) {
  const table = useServerTable({
    initialPageSize: 10,
    initialSorting: DEFAULT_SORTING,
  });
  const { clampPageIndex } = table;

  const genresQuery = useQuery({
    queryKey: ['admin-genres', 'list', table.params],
    queryFn: () => genreApi.getAll(table.params),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const genres = genresQuery.data?.result ?? EMPTY_GENRES;
  const total = genresQuery.data?.pagination?.total ?? 0;

  // Filter/search làm tổng bản ghi giảm → lùi về trang cuối hợp lệ.
  useEffect(() => {
    clampPageIndex(total);
  }, [clampPageIndex, total]);

  const createGenre = adminGenres.useCreate();
  const updateGenre = adminGenres.useUpdate();
  const deleteGenre = adminGenres.useDelete();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Genre | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Genre | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const columns = useMemo(
    () =>
      createGenreColumns({
        onEdit: (genre) => {
          setEditing(genre);
          setFormOpen(true);
        },
        onDelete: (genre) => setDeleteTarget(genre),
      }),
    [],
  );

  const defaultValues = useMemo<AdminFormValues>(
    () => ({
      name: editing?.name ?? '',
      enName: editing?.enName ?? '',
    }),
    [editing],
  );

  const handleSubmit = async (values: AdminFormValues) => {
    const input = {
      name: String(values.name ?? '').trim(),
      enName: values.enName ? String(values.enName).trim() : undefined,
    };

    if (editing) {
      await updateGenre.mutateAsync({ id: editing.id, data: input });
    } else {
      await createGenre.mutateAsync(input);
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteGenre.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Lỗi đã được toast trong mutation — giữ dialog mở để user thử lại.
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <AdminPageHeader title={title} description={description} queryRoots={[['admin-genres']]} />
      <AdminTablePage
        table={table}
        columns={columns}
        data={genres}
        total={total}
        isLoading={genresQuery.isLoading}
        isFetching={genresQuery.isFetching}
        error={genresQuery.error}
        onRetry={() => void genresQuery.refetch()}
        searchPlaceholder="Tìm theo tên thể loại…"
        searchLabel="Tìm kiếm thể loại"
        filterFields={GENRE_FILTER_FIELDS}
        entityLabel="thể loại"
        emptyDescription="Thêm thể loại đầu tiên để gắn vào phim."
        addLabel="Thêm thể loại"
        onAdd={openCreate}
      >
        <AdminFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          title={editing ? 'Sửa thể loại' : 'Thêm thể loại'}
          description={
            editing
              ? 'Cập nhật tên thể loại. Thay đổi áp dụng ngay cho danh sách phim.'
              : 'Tạo thể loại mới để phân loại phim.'
          }
          fields={GENRE_FORM_FIELDS}
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          submitting={createGenre.isPending || updateGenre.isPending}
          submitLabel={editing ? 'Lưu thay đổi' : 'Thêm thể loại'}
          mapServerError={(error) =>
            parseAxiosError(error).statusCode === 409
              ? { field: 'name', message: 'Thể loại này đã tồn tại' }
              : null
          }
        />

        <AdminDeleteDialog
          open={deleteTarget !== null}
          onOpenChange={(next) => {
            if (!next) setDeleteTarget(null);
          }}
          title="Xóa thể loại?"
          description={
            <>
              Thể loại{' '}
              <span className="text-foreground font-medium">{deleteTarget?.name ?? 'này'}</span> sẽ
              bị xóa khỏi tất cả phim liên quan. Hành động này không thể hoàn tác.
            </>
          }
          onConfirm={handleDelete}
          deleting={deleteGenre.isPending}
        />
      </AdminTablePage>
    </div>
  );
}
