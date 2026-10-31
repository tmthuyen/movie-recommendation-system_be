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
  { name: 'viName', label: 'Tên quốc gia', placeholder: 'vd. Hàn Quốc' },
  { name: 'enName', label: 'Tên quốc gia (tiếng Anh)', placeholder: 'vd. South Korea' },
  { name: 'code', label: 'Mã quốc gia (ISO)', placeholder: 'vd. KR' },
  { name: 'region', label: 'Khu vực', placeholder: 'vd. Asia' },
];

type CountryForm = {
  viName: string;
  enName: string;
  code: string;
  region: string;
};

const schema = z.object({
  viName: z.string().min(1, 'Tên quốc gia là bắt buộc'),
  enName: z.string().min(1, 'Tên quốc gia (tiếng Anh) là bắt buộc'),
  code: z
    .string()
    .nonempty('Mã quốc gia là bắt buộc')
    .max(2, 'Mã quốc gia không được vượt quá 2 ký tự'),
  region: z.string().min(1, 'Khu vực là bắt buộc'),
}) as unknown as z.ZodType<CountryForm>;

const COLUMNS: DataTableColumn<Country>[] = [
  {
    key: 'id',
    header: 'ID',
    className: 'w-20 text-muted-foreground',
    render: (country) => country.id,
  },
  {
    key: 'viName',
    header: 'Tên quốc gia',
    render: (country) => <span className="font-medium">{country.viName}</span>,
  },
  {
    key: 'enName',
    header: 'Tên tiếng Anh',
    render: (country) => <span className="font-medium">{country.enName}</span>,
  },
  {
    key: 'code',
    header: 'Mã',
    render: (country) => <span className="font-mono text-xs">{country.code}</span>,
  },
  {
    key: 'region',
    header: 'Khu vực',
    render: (country) => <span className="font-mono text-xs">{country.region}</span>,
  },
];

/** CRUD Quốc gia — dùng chung DataTable/CrudFormDialog/CrudDeleteDialog của admin. */
export function CountriesClient() {
  const mutations = {
    create: adminCountries.useCreate(),
    update: adminCountries.useUpdate(),
    remove: adminCountries.useDelete(),
  };
  const state = useCrudPage<
    Country,
    { viName: string; enName: string; code: string; region: string }
  >(mutations);
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
        onSubmit={(values, onSuccess) => {
          state.submit(
            {
              viName: String(values.viName ?? ''),
              enName: String(values.enName ?? ''),
              code: String(values.code ?? ''),
              region: String(values.region ?? ''),
            },
            onSuccess,
          );
        }}
        submitting={state.saving}
      />

      <CrudDeleteDialog
        target={
          state.deleteTarget
            ? { id: state.deleteTarget.id, label: state.deleteTarget.viName }
            : null
        }
        onCancel={() => state.setDeleteTarget(null)}
        onConfirm={state.confirmDelete}
        isPending={state.deleting}
        entityLabel="quốc gia"
      />
    </div>
  );
}
