'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { peopleApi } from '@/apis/people.api';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminDeleteDialog } from '@/components/admin/data-view/admin-delete-dialog';
import { AdminFormDialog } from '@/components/admin/data-view/admin-form-dialog';
import type {
  AdminFormField,
  AdminFormValues,
} from '@/components/admin/data-view/admin-form-schema';
import { AdminTablePage } from '@/components/admin/data-view/admin-table-page';
import { adminPeoples } from '@/hooks/tankstack/admin';
import { useServerTable } from '@/hooks/use-server-table';
import { parseAxiosError } from '@/lib/axiosClient';
import type { People } from '@/shared/types/movie.types';
import { PEOPLE_FILTER_FIELDS } from './people-filter-fields';
import { createPeopleColumns } from './people-columns';

const EMPTY_PEOPLES: People[] = [];
const DEFAULT_SORTING = [{ id: 'fullName', desc: false }];

const PEOPLE_FORM_FIELDS: AdminFormField[] = [
  {
    name: 'fullName',
    label: 'Họ tên',
    required: true,
    maxLength: 100,
    placeholder: 'VD: Tom Holland',
    wide: true,
  },
  {
    name: 'birthDate',
    label: 'Ngày sinh',
    type: 'date',
  },
  {
    name: 'nationality',
    label: 'Quốc tịch',
    maxLength: 50,
    placeholder: 'VD: British',
  },
  {
    name: 'gender',
    label: 'Giới tính',
    maxLength: 20,
    placeholder: 'VD: Male',
  },
  {
    name: 'mainRole',
    label: 'Vai trò chính',
    maxLength: 50,
    placeholder: 'VD: actor',
  },
];

/** Tên hiển thị — ưu tiên `fullName` (entity), fallback `name` (type cũ). */
function displayName(people: People): string {
  return people.fullName ?? people.name ?? `#${people.id}`;
}

interface PeopleClientProps {
  title?: string;
  description?: string;
}

export function PeopleClient({
  title = 'Diễn viên / Đạo diễn',
  description = 'Quản lý người tham gia phim',
}: PeopleClientProps = {}) {
  const table = useServerTable({
    initialPageSize: 10,
    initialSorting: DEFAULT_SORTING,
  });
  const { clampPageIndex } = table;

  const peoplesQuery = useQuery({
    queryKey: ['admin-peoples', 'list', table.params],
    queryFn: () => peopleApi.getAll(table.params),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const peoples = peoplesQuery.data?.result ?? EMPTY_PEOPLES;
  const total = peoplesQuery.data?.pagination?.total ?? 0;

  useEffect(() => {
    clampPageIndex(total);
  }, [clampPageIndex, total]);

  const createPeople = adminPeoples.useCreate();
  const updatePeople = adminPeoples.useUpdate();
  const deletePeople = adminPeoples.useDelete();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<People | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<People | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const columns = useMemo(
    () =>
      createPeopleColumns({
        onEdit: (people) => {
          setEditing(people);
          setFormOpen(true);
        },
        onDelete: (people) => setDeleteTarget(people),
      }),
    [],
  );

  const defaultValues = useMemo<AdminFormValues>(
    () => ({
      fullName: editing?.fullName ?? editing?.name ?? '',
      birthDate: editing?.birthDate ? String(editing.birthDate).slice(0, 10) : '',
      nationality: editing?.nationality ?? '',
      gender: editing?.gender ?? '',
      mainRole: editing?.mainRole ?? '',
    }),
    [editing],
  );

  const handleSubmit = async (values: AdminFormValues) => {
    const input = {
      fullName: String(values.fullName ?? '').trim(),
      birthDate: values.birthDate ? String(values.birthDate) : undefined,
      nationality: values.nationality ? String(values.nationality).trim() : undefined,
      gender: values.gender ? String(values.gender).trim() : undefined,
      mainRole: values.mainRole ? String(values.mainRole).trim() : undefined,
    };

    if (editing) {
      await updatePeople.mutateAsync({ id: editing.id, data: input });
    } else {
      await createPeople.mutateAsync(input);
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePeople.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Lỗi đã được toast trong mutation — giữ dialog mở để user thử lại.
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <AdminPageHeader title={title} description={description} queryRoots={[['admin-peoples']]} />
      <AdminTablePage
        table={table}
        columns={columns}
        data={peoples}
        total={total}
        isLoading={peoplesQuery.isLoading}
        isFetching={peoplesQuery.isFetching}
        error={peoplesQuery.error}
        onRetry={() => void peoplesQuery.refetch()}
        searchPlaceholder="Tìm theo họ tên diễn viên…"
        searchLabel="Tìm kiếm diễn viên / đạo diễn"
        filterFields={PEOPLE_FILTER_FIELDS}
        entityLabel="diễn viên"
        emptyDescription="Thêm diễn viên hoặc đạo diễn đầu tiên để gắn vào phim."
        addLabel="Thêm diễn viên"
        onAdd={openCreate}
      >
        <AdminFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          title={editing ? 'Sửa thông tin' : 'Thêm diễn viên / đạo diễn'}
          description={
            editing
              ? 'Cập nhật thông tin người tham gia phim đang chọn.'
              : 'Tạo hồ sơ mới cho diễn viên hoặc đạo diễn.'
          }
          fields={PEOPLE_FORM_FIELDS}
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          submitting={createPeople.isPending || updatePeople.isPending}
          submitLabel={editing ? 'Lưu thay đổi' : 'Thêm'}
          mapServerError={(error) =>
            parseAxiosError(error).statusCode === 409
              ? { field: 'fullName', message: 'Họ tên này đã tồn tại' }
              : null
          }
        />

        <AdminDeleteDialog
          open={deleteTarget !== null}
          onOpenChange={(next) => {
            if (!next) setDeleteTarget(null);
          }}
          title="Xóa hồ sơ?"
          description={
            <>
              Hồ sơ{' '}
              <span className="text-foreground font-medium">
                {deleteTarget ? displayName(deleteTarget) : 'này'}
              </span>{' '}
              sẽ bị xóa khỏi tất cả phim liên quan. Hành động này không thể hoàn tác.
            </>
          }
          onConfirm={handleDelete}
          deleting={deletePeople.isPending}
        />
      </AdminTablePage>
    </div>
  );
}
