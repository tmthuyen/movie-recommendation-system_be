'use client';

import { CrudToolbar } from '@/components/admin/crud-toolbar';
import { CrudTableSkeleton, DataTable, DataTableColumn } from '@/components/admin/data-table';
import { CrudDeleteDialog } from '@/components/admin/delete-dialog';
import { CrudFormDialog, CrudFormField, useCrudFormValues } from '@/components/admin/form-dialog';
import { DataPagination } from '@/components/common/DataPagination';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { adminCountries } from '@/hooks/tankstack/admin';
import { useCrudPage } from '@/hooks/tankstack/admin-crud';
import { Country } from '@/shared/types/movie.types';
import { z } from 'zod';

const FIELDS: CrudFormField[] = [
  { name: 'name', label: 'Tên quốc gia', placeholder: 'vd. Hàn Quốc' },
  { name: 'code', label: 'Mã quốc gia (ISO)', placeholder: 'vd. KR' },
];

type CountryForm = Record<string, unknown>;

const schema = z.object({
  name: z.string().min(1, 'Tên quốc gia là bắt buộc'),
  code: z.string().min(1, 'Mã quốc gia là bắt buộc'),
}) as unknown as z.ZodType<CountryForm>;

const COLUMNS: DataTableColumn<Country>[] = [
  { key: 'id', header: 'ID', className: 'w-20 text-muted-foreground', render: (country) => country.id },
  {
    key: 'name',
    header: 'Tên quốc gia',
    render: (country) => <span className="font-medium">{country.name}</span>,
  },
  {
    key: 'code',
    header: 'Mã',
    render: (country) => <span className="font-mono text-xs">{country.code}</span>,
  },
];

/** CRUD Quốc gia — dùng chung DataTable/CrudFormDialog/CrudDeleteDialog của admin. */
export function CountriesClient() {
  const mutations = {
    create: adminCountries.useCreate(),
    update: adminCountries.useUpdate(),
    remove: adminCountries.useDelete(),
  };
  const state = useCrudPage<Country, { name: string; code: string }>(mutations);
  const list = adminCountries.useList({ page: state.page, limit: 10, keyword: state.keyword });
  const defaultValues = useCrudFormValues<CountryForm>(FIELDS, state.editing);

  return (
    <div className="flex w-full flex-col gap-4">
      <CrudToolbar
        keyword={state.keywordInput}
        onKeywordChange={state.setKeywordInput}
        searchPlaceholder="Tìm quốc gia…"
        onAdd={state.openCreate}
        addLabel="Thêm quốc gia"
      />

      {list.isLoading ? (
        <CrudTableSkeleton />
      ) : list.isError ? (
        <ErrorState
          title="Không thể tải danh sách quốc gia"
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={() => list.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            items={list.data?.items ?? []}
            rowKey={(country) => country.id}
            onEdit={state.openEdit}
            onDelete={(country) => state.setDeleteTarget(country)}
            empty={
              <EmptyState
                title="Không có quốc gia nào"
                description="Thêm quốc gia đầu tiên để gắn phim theo xuất xứ."
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
              ariaLabel="Phân trang quốc gia"
            />
          ) : null}
        </>
      )}

      <CrudFormDialog<CountryForm>
        open={state.dialogOpen}
        onOpenChange={state.setDialogOpen}
        title={state.editing ? 'Sửa quốc gia' : 'Thêm quốc gia'}
        schema={schema}
        fields={FIELDS}
        defaultValues={defaultValues}
        onSubmit={(values) =>
          state.submit({
            name: String(values.name ?? ''),
            code: String(values.code ?? ''),
          })
        }
        submitting={state.saving}
      />

      <CrudDeleteDialog
        target={
          state.deleteTarget ? { id: state.deleteTarget.id, label: state.deleteTarget.name } : null
        }
        onCancel={() => state.setDeleteTarget(null)}
        onConfirm={state.confirmDelete}
        isPending={state.deleting}
        entityLabel="quốc gia"
      />
    </div>
  );
}
