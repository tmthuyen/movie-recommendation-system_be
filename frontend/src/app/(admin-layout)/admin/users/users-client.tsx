'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { userApi } from '@/apis/user.api';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { AdminDeleteDialog } from '@/components/admin/data-view/admin-delete-dialog';
import { AdminFormDialog } from '@/components/admin/data-view/admin-form-dialog';
import type {
  AdminFormDirtyFields,
  AdminFormField,
  AdminFormValues,
} from '@/components/admin/data-view/admin-form-schema';
import { AdminTablePage } from '@/components/admin/data-view/admin-table-page';
import { adminRoles, adminUsers, type AdminUserInput } from '@/hooks/tankstack/admin';
import { useServerTable } from '@/hooks/use-server-table';
import { parseAxiosError } from '@/lib/axiosClient';
import type { User } from '@/shared/types/api.types';
import { UserDetailDialog } from './user-detail-dialog';
import { createUserFilterFields } from './user-filter-fields';
import { buildUserPayload } from './user-form-payload';
import { createUserColumns } from './users-columns';

const EMPTY_USERS: User[] = [];
const DEFAULT_SORTING = [{ id: 'createdAt', desc: true }];

/**
 * Field dùng chung cho cả tạo và sửa. `PUT /users/me` dùng `UpdateProfileDto`
 * (không nhận email); `PUT /users/:id` dùng `AdminUpdateUserDto`
 * (nhận email/status/isVerified).
 */
const USER_STATUS_OPTIONS = [
  { value: 'UNVERIFIED', label: 'Chưa xác thực' },
  { value: 'ACTIVE', label: 'Hoạt động' },
  { value: 'INACTIVE', label: 'Không hoạt động' },
  { value: 'BLOCKED', label: 'Đã khóa' },
];

const USER_VERIFIED_OPTIONS = [
  { value: 'true', label: 'Đã xác thực' },
  { value: 'false', label: 'Chưa xác thực' },
];

const EDIT_USER_FORM_FIELDS: AdminFormField[] = [
  {
    name: 'email',
    label: 'Email',
    required: true,
    maxLength: 255,
    placeholder: 'VD: user@example.com',
    wide: true,
  },
  {
    name: 'fullName',
    label: 'Họ tên',
    required: true,
    maxLength: 100,
    placeholder: 'VD: Nguyễn Văn A',
    wide: true,
  },
  {
    name: 'status',
    label: 'Trạng thái tài khoản',
    type: 'select',
    options: USER_STATUS_OPTIONS,
    placeholder: 'Chọn trạng thái',
  },
  {
    name: 'isVerified',
    label: 'Xác thực email',
    type: 'select',
    options: USER_VERIFIED_OPTIONS,
    placeholder: 'Chọn trạng thái xác thực',
  },
  {
    name: 'phoneNumber',
    label: 'Số điện thoại',
    maxLength: 20,
    placeholder: 'VD: 0901234567',
  },
  {
    name: 'birthDate',
    label: 'Ngày sinh',
    type: 'date',
  },
  {
    name: 'gender',
    label: 'Giới tính',
    maxLength: 20,
    placeholder: 'VD: male',
  },
  {
    name: 'avatarUrl',
    label: 'URL ảnh đại diện',
    placeholder: 'https://…',
    wide: true,
  },
];

const CREATE_USER_FORM_FIELDS: AdminFormField[] = [
  {
    name: 'email',
    label: 'Email',
    required: true,
    maxLength: 255,
    placeholder: 'VD: user@example.com',
    wide: true,
  },
  {
    name: 'fullName',
    label: 'Họ tên',
    required: true,
    maxLength: 100,
    placeholder: 'VD: Nguyễn Văn A',
    wide: true,
  },
  {
    name: 'password',
    label: 'Mật khẩu',
    required: true,
    placeholder: 'Tối thiểu 8 ký tự',
  },
  {
    name: 'confirmPassword',
    label: 'Xác nhận mật khẩu',
    required: true,
    placeholder: 'Nhập lại mật khẩu',
  },
];

/** Chuyển giá trị ngày (Date | ISO string) sang `YYYY-MM-DD` cho input date. */
function toDateInput(value?: string | Date): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
}

interface UsersClientProps {
  title?: string;
  description?: string;
}

export function UsersClient({
  title = 'Người dùng',
  description = 'Quản lý người dùng',
}: UsersClientProps = {}) {
  const queryClient = useQueryClient();

  const table = useServerTable({
    initialPageSize: 10,
    initialSorting: DEFAULT_SORTING,
  });
  const { clampPageIndex } = table;

  const usersQuery = adminUsers.useList(table.params);
  const users = usersQuery.data?.items ?? EMPTY_USERS;
  const total = usersQuery.data?.pagination?.total ?? 0;

  useEffect(() => {
    clampPageIndex(total);
  }, [clampPageIndex, total]);

  // Toàn bộ role (chỉ ~vài bản ghi) để chọn khi tạo user / gán quyền.
  const rolesQuery = adminRoles.useList({ page: 1, limit: 100 });
  const roleOptions = useMemo(
    () =>
      (rolesQuery.data?.items ?? []).map((role) => ({
        value: String(role.id),
        label: `${role.name} (${role.code})`,
      })),
    [rolesQuery.data],
  );

  const filterFields = useMemo(() => createUserFilterFields(roleOptions), [roleOptions]);

  const createFields = useMemo<AdminFormField[]>(
    () => [
      ...CREATE_USER_FORM_FIELDS,
      {
        name: 'roleIds',
        label: 'Vai trò',
        type: 'multiselect',
        required: true,
        options: roleOptions,
        placeholder: 'Chọn vai trò',
        description: 'Bắt buộc chọn ít nhất một vai trò khi tạo người dùng.',
        wide: true,
      },
    ],
    [roleOptions],
  );

  const assignRoleFields = useMemo<AdminFormField[]>(
    () => [
      {
        name: 'roleIds',
        label: 'Vai trò',
        type: 'multiselect',
        required: true,
        options: roleOptions,
        placeholder: 'Chọn vai trò',
        description: 'Danh sách vai trò sẽ thay thế toàn bộ vai trò hiện tại của người dùng.',
        wide: true,
      },
    ],
    [roleOptions],
  );

  const createUser = adminUsers.useCreate();
  const updateUser = adminUsers.useUpdate();
  const deleteUser = adminUsers.useDelete();

  const assignRoles = useMutation({
    mutationFn: ({ userId, roleIds }: { userId: string; roleIds: number[] }) =>
      userApi.updateUserRoles(userId, roleIds),
    onSuccess: () => {
      toast.success('Đã cập nhật vai trò.');
      void queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [detailTarget, setDetailTarget] = useState<User | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);
  const [rolesTarget, setRolesTarget] = useState<User | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const columns = useMemo(
    () =>
      createUserColumns({
        onEdit: (user) => {
          setEditing(user);
          setFormOpen(true);
        },
        onViewDetails: (user) => setDetailTarget(user),
        onAssignRoles: (user) => setRolesTarget(user),
        onDelete: (user) => setDeleteTarget(user),
      }),
    [],
  );

  const createDefaults = useMemo<AdminFormValues>(
    () => ({
      email: '',
      fullName: '',
      password: '',
      confirmPassword: '',
      roleIds: [],
    }),
    [],
  );

  const editDefaults = useMemo<AdminFormValues>(
    () => ({
      email: editing?.email ?? '',
      fullName: editing?.fullName ?? '',
      status: editing?.status ?? '',
      // Select của form nhận chuỗi; boolean được convert lại trong buildUserPayload.
      isVerified: editing ? String(editing.isVerified) : 'false',
      phoneNumber: editing?.phoneNumber ?? '',
      birthDate: toDateInput(editing?.birthDate),
      gender: editing?.gender ?? '',
      avatarUrl: editing?.avatarUrl ?? '',
    }),
    [editing],
  );

  const rolesDefaults = useMemo<AdminFormValues>(
    () => ({
      roleIds: (rolesTarget?.roles ?? []).map((role) => String(role.id)),
    }),
    [rolesTarget],
  );

  const handleCreate = async (values: AdminFormValues) => {
    const input: AdminUserInput = {
      email: String(values.email ?? '').trim(),
      fullName: String(values.fullName ?? '').trim(),
      password: String(values.password ?? ''),
      confirmPassword: String(values.confirmPassword ?? ''),
      roleIds: Array.isArray(values.roleIds)
        ? values.roleIds.map(Number).filter(Number.isFinite)
        : [],
    };

    await createUser.mutateAsync(input);
    setFormOpen(false);
  };

  const handleEdit = async (values: AdminFormValues, dirtyFields: AdminFormDirtyFields) => {
    if (!editing) return;
    const input = buildUserPayload(values, dirtyFields, true);

    await updateUser.mutateAsync({ id: editing.id, data: input });
    setFormOpen(false);
    setEditing(null);
  };

  const handleAssignRoles = async (values: AdminFormValues) => {
    if (!rolesTarget) return;
    const roleIds = Array.isArray(values.roleIds)
      ? values.roleIds.map(Number).filter(Number.isFinite)
      : [];

    await assignRoles.mutateAsync({ userId: rolesTarget.id, roleIds });
    setRolesTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Lỗi đã được toast trong mutation — giữ dialog mở để user thử lại.
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <AdminPageHeader title={title} description={description} queryRoots={[['admin-users']]} />
      <AdminTablePage
        table={table}
        columns={columns}
        data={users}
        total={total}
        isLoading={usersQuery.isLoading}
        isFetching={usersQuery.isFetching}
        error={usersQuery.error}
        onRetry={() => void usersQuery.refetch()}
        searchPlaceholder="Tìm theo tên, email, số điện thoại…"
        searchLabel="Tìm kiếm người dùng"
        filterFields={filterFields}
        entityLabel="người dùng"
        emptyDescription="Thêm người dùng đầu tiên để bắt đầu quản lý tài khoản."
        addLabel="Thêm người dùng"
        onAdd={openCreate}
      >
        <AdminFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          title={editing ? 'Sửa người dùng' : 'Thêm người dùng'}
          description={
            editing
              ? 'Cập nhật thông tin hồ sơ. Dùng nút “Gán vai trò” để thay đổi quyền.'
              : 'Tạo tài khoản mới và gán vai trò ban đầu.'
          }
          fields={editing ? EDIT_USER_FORM_FIELDS : createFields}
          defaultValues={editing ? editDefaults : createDefaults}
          onSubmit={editing ? handleEdit : handleCreate}
          submitting={createUser.isPending || updateUser.isPending}
          submitLabel={editing ? 'Lưu thay đổi' : 'Thêm người dùng'}
          mapServerError={(error) => {
            const parsed = parseAxiosError(error);
            if (parsed.statusCode === 409) {
              return { field: 'email', message: 'Email này đã được sử dụng' };
            }
            // 400/403: hiển thị message từ envelope; toast đã do hook mutation lo.
            if (parsed.statusCode === 400 || parsed.statusCode === 403) {
              return { field: 'root', message: parsed.message };
            }
            return null;
          }}
        />

        <AdminFormDialog
          open={rolesTarget !== null}
          onOpenChange={(next) => {
            if (!next) setRolesTarget(null);
          }}
          title="Gán vai trò"
          description={
            rolesTarget
              ? `Chọn vai trò cho ${rolesTarget.fullName}. Danh sách mới sẽ thay thế vai trò hiện tại.`
              : undefined
          }
          fields={assignRoleFields}
          defaultValues={rolesDefaults}
          onSubmit={handleAssignRoles}
          submitting={assignRoles.isPending}
          submitLabel="Lưu vai trò"
        />

        <UserDetailDialog
          user={detailTarget}
          open={detailTarget !== null}
          onOpenChange={(next) => {
            if (!next) setDetailTarget(null);
          }}
          onEdit={(user) => {
            setDetailTarget(null);
            setEditing(user);
            setFormOpen(true);
          }}
        />

        <AdminDeleteDialog
          open={deleteTarget !== null}
          onOpenChange={(next) => {
            if (!next) setDeleteTarget(null);
          }}
          title="Khóa người dùng?"
          description={
            <>
              Tài khoản{' '}
              <span className="text-foreground font-medium">
                {deleteTarget?.fullName ?? deleteTarget?.email ?? 'này'}
              </span>{' '}
              sẽ bị chuyển sang trạng thái khóa và không thể đăng nhập. Hành động này có thể hoàn
              tác bằng cách cập nhật lại trạng thái trong CSDL.
            </>
          }
          onConfirm={handleDelete}
          deleting={deleteUser.isPending}
        />
      </AdminTablePage>
    </div>
  );
}
