'use client';

import { CrudToolbar } from '@/components/admin/crud-toolbar';
import { CrudTableSkeleton, DataTable, DataTableColumn } from '@/components/admin/data-table';
import { CrudDeleteDialog } from '@/components/admin/delete-dialog';
import { CrudFormDialog, CrudFormField, useCrudFormValues } from '@/components/admin/form-dialog';
import { DataPagination } from '@/components/common/DataPagination';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { adminGenres } from '@/hooks/tankstack/admin';
import { useCrudPage } from '@/hooks/tankstack/admin-crud';
import { Genre } from '@/shared/types/api.types';
import { z } from 'zod';

const FIELDS: CrudFormField[] = [
  { name: 'name', label: 'Tên thể loại (tiếng Việt)', placeholder: 'vd. Hành động' },
  { name: 'enName', label: 'Tên tiếng Anh', placeholder: 'vd. Action' },
];

type GenreForm = Record<string, unknown>;

const schema = z.object({
  name: z.string().min(1, 'Tên thể loại là bắt buộc'),
  enName: z.string().optional(),
}) as unknown as z.ZodType<GenreForm>;

const COLUMNS: DataTableColumn<Genre>[] = [
  { key: 'id', header: 'ID', className: 'w-20 text-muted-foreground', render: (genre) => genre.id },
  { key: 'name', header: 'Tên thể loại', render: (genre) => <span className="font-medium">{genre.name}</span> },
  {
    key: 'enName',
    header: 'Tên tiếng Anh',
    render: (genre) => genre.enName ?? <span className="text-muted-foreground">—</span>,
  },
];

/** CRUD Thể loại — dùng chung DataTable/CrudFormDialog/CrudDeleteDialog của admin. */
export function GenresClient() {
  const mutations = {
    create: adminGenres.useCreate(),
    update: adminGenres.useUpdate(),
    remove: adminGenres.useDelete(),
  };
  const state = useCrudPage<Genre, { name: string; enName?: string }>(mutations);
  const list = adminGenres.useList({ page: state.page, limit: 10, keyword: state.keyword });
  const defaultValues = useCrudFormValues<GenreForm>(FIELDS, state.editing);

  return (
    <div className="flex w-full flex-col gap-4">
      <CrudToolbar
        keyword={state.keywordInput}
        onKeywordChange={state.setKeywordInput}
        searchPlaceholder="Tìm thể loại…"
        onAdd={state.openCreate}
        addLabel="Thêm thể loại"
      />

      {list.isLoading ? (
        <CrudTableSkeleton />
      ) : list.isError ? (
        <ErrorState
          title="Không thể tải danh sách thể loại"
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={() => list.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            items={list.data?.items ?? []}
            rowKey={(genre) => genre.id}
            onEdit={state.openEdit}
            onDelete={(genre) => state.setDeleteTarget(genre)}
            empty={
              <EmptyState
                title="Không có thể loại nào"
                description="Thêm thể loại đầu tiên để phân loại phim."
              />
            }
          />
          {list.data ? (
            <DataPagination
              page={list.data.pagination.page}
              totalPages={list.data.pagination.totalPages}
              total={list.data.pagination.total}
              onPageChange={state.setPage}
              disabled={list.isFetching}
              ariaLabel="Phân trang thể loại"
            />
          ) : null}
        </>
      )}

      <CrudFormDialog<GenreForm>
        open={state.dialogOpen}
        onOpenChange={state.setDialogOpen}
        title={state.editing ? 'Sửa thể loại' : 'Thêm thể loại'}
        schema={schema}
        fields={FIELDS}
        defaultValues={defaultValues}
        onSubmit={(values) =>
          state.submit({
            name: String(values.name ?? ''),
            enName: values.enName ? String(values.enName) : undefined,
          })
        }
        submitting={state.saving}
      />

      <CrudDeleteDialog
        target={state.deleteTarget ? { id: state.deleteTarget.id, label: state.deleteTarget.name } : null}
        onCancel={() => state.setDeleteTarget(null)}
        onConfirm={state.confirmDelete}
        isPending={state.deleting}
        entityLabel="thể loại"
      />
    </div>
  );
}
