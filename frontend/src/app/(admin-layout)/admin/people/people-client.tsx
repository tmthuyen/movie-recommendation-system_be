'use client';

import { CrudToolbar } from '@/components/admin/crud-toolbar';
import { CrudTableSkeleton, DataTable, DataTableColumn } from '@/components/admin/data-table';
import { CrudDeleteDialog } from '@/components/admin/delete-dialog';
import { CrudFormDialog, CrudFormField, useCrudFormValues } from '@/components/admin/form-dialog';
import { DataPagination } from '@/components/common/DataPagination';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { adminPeoples } from '@/hooks/tankstack/admin';
import { useCrudPage } from '@/hooks/tankstack/admin-crud';
import { PeopleInput } from '@/apis/people.api';
import { People } from '@/shared/types/movie.types';
import { z } from 'zod';

const FIELDS: CrudFormField[] = [
  { name: 'fullName', label: 'Họ tên', placeholder: 'vd. Bong Joon-ho' },
  { name: 'birthDate', label: 'Ngày sinh', placeholder: 'YYYY-MM-DD (để trống nếu chưa rõ)' },
  { name: 'nationality', label: 'Quốc tịch', placeholder: 'vd. Hàn Quốc' },
  {
    name: 'mainRole',
    label: 'Vai trò chính',
    type: 'select',
    options: [
      { value: '', label: '— Không rõ —' },
      { value: 'actor', label: 'Diễn viên' },
      { value: 'director', label: 'Đạo diễn' },
      { value: 'writer', label: 'Biên kịch' },
      { value: 'producer', label: 'Nhà sản xuất' },
    ],
  },
  {
    name: 'gender',
    label: 'Giới tính',
    type: 'select',
    options: [
      { value: '', label: '— Không rõ —' },
      { value: 'male', label: 'Nam' },
      { value: 'female', label: 'Nữ' },
      { value: 'other', label: 'Khác' },
    ],
  },
];

type PeopleForm = Record<string, unknown>;

const schema = z.object({
  fullName: z.string().min(1, 'Họ tên là bắt buộc'),
  birthDate: z.string().optional(),
  nationality: z.string().optional(),
  mainRole: z.string().optional(),
  gender: z.string().optional(),
}) as unknown as z.ZodType<PeopleForm>;

const COLUMNS: DataTableColumn<People>[] = [
  { key: 'id', header: 'ID', className: 'w-20 text-muted-foreground', render: (people) => people.id },
  {
    key: 'fullName',
    header: 'Họ tên',
    render: (people) => <span className="font-medium">{people.fullName ?? people.name}</span>,
  },
  {
    key: 'mainRole',
    header: 'Vai trò',
    render: (people) => people.mainRole ?? <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'nationality',
    header: 'Quốc tịch',
    hideOnMobile: true,
    render: (people) => people.nationality ?? <span className="text-muted-foreground">—</span>,
  },
  {
    key: 'birthDate',
    header: 'Ngày sinh',
    hideOnMobile: true,
    render: (people) => people.birthDate ?? <span className="text-muted-foreground">—</span>,
  },
];

/** CRUD Diễn viên/Đạo diễn — dùng chung DataTable/CrudFormDialog/CrudDeleteDialog của admin. */
export function PeopleClient() {
  const mutations = {
    create: adminPeoples.useCreate(),
    update: adminPeoples.useUpdate(),
    remove: adminPeoples.useDelete(),
  };
  const state = useCrudPage<People, PeopleInput>(mutations);
  const list = adminPeoples.useList({ page: state.page, limit: 10, keyword: state.keyword });
  const defaultValues = useCrudFormValues<PeopleForm>(FIELDS, state.editing);

  return (
    <div className="flex w-full flex-col gap-4">
      <CrudToolbar
        keyword={state.keywordInput}
        onKeywordChange={state.setKeywordInput}
        searchPlaceholder="Tìm diễn viên/đạo diễn…"
        onAdd={state.openCreate}
        addLabel="Thêm người"
      />

      {list.isLoading ? (
        <CrudTableSkeleton />
      ) : list.isError ? (
        <ErrorState
          title="Không thể tải danh sách người tham gia"
          description="Vui lòng kiểm tra kết nối và thử lại."
          onRetry={() => list.refetch()}
        />
      ) : (
        <>
          <DataTable
            columns={COLUMNS}
            items={list.data?.items ?? []}
            rowKey={(people) => people.id}
            onEdit={state.openEdit}
            onDelete={(people) => state.setDeleteTarget(people)}
            empty={
              <EmptyState
                title="Chưa có người tham gia nào"
                description="Thêm diễn viên/đạo diễn để gán vào phim."
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
              ariaLabel="Phân trang người tham gia"
            />
          ) : null}
        </>
      )}

      <CrudFormDialog
        open={state.dialogOpen}
        onOpenChange={state.setDialogOpen}
        title={state.editing ? 'Sửa người tham gia' : 'Thêm người tham gia'}
        schema={schema}
        fields={FIELDS}
        defaultValues={defaultValues}
        onSubmit={(values) =>
          state.submit({
            fullName: String(values.fullName ?? ''),
            birthDate: values.birthDate ? String(values.birthDate) : undefined,
            nationality: values.nationality ? String(values.nationality) : undefined,
            mainRole: values.mainRole ? String(values.mainRole) : undefined,
            gender: values.gender ? String(values.gender) : undefined,
          })
        }
        submitting={state.saving}
      />

      <CrudDeleteDialog
        target={
          state.deleteTarget
            ? { id: state.deleteTarget.id, label: state.deleteTarget.fullName ?? String(state.deleteTarget.id) }
            : null
        }
        onCancel={() => state.setDeleteTarget(null)}
        onConfirm={state.confirmDelete}
        isPending={state.deleting}
        entityLabel="người tham gia"
      />
    </div>
  );
}
