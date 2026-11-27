'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { roleApi, type RoleInput } from '@/apis/role.api';
import { AdminPageHeader } from '@/components/admin/admin-page-header';
import { ActiveFilterChips } from '@/components/admin/data-view/active-filter-chips';
import { DataTable } from '@/components/admin/data-view/data-table';
import { DataTablePagination } from '@/components/admin/data-view/data-table-pagination';
import { DataTableToolbar } from '@/components/admin/data-view/data-table-toolbar';
import { FilterBuilder } from '@/components/admin/data-view/filter-builder';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adminRoles } from '@/hooks/tankstack/admin';
import { useServerTable } from '@/hooks/use-server-table';
import type { Role } from '@/shared/types/api.types';
import { RoleDeleteDialog } from './role-delete-dialog';
import { ROLE_FILTER_FIELDS } from './role-filter-fields';
import { RoleFormDialog } from './role-form-dialog';
import { createRoleColumns } from './roles-columns';

/** Identity ổn định cho fallback data (tránh reset row model mỗi render). */
const EMPTY_ROLES: Role[] = [];
const DEFAULT_SORTING = [{ id: 'createdAt', desc: true }];

interface RolesClientProps {
  title?: string;
  description?: string;
}

export function RolesClient({
  title = 'Vai trò',
  description = 'Quản lý vai trò và phân quyền',
}: RolesClientProps = {}) {
  const table = useServerTable({
    initialPageSize: 10,
    initialSorting: DEFAULT_SORTING,
  });
  const { clampPageIndex } = table;

  const rolesQuery = useQuery({
    queryKey: ['admin-roles', 'list', table.params],
    queryFn: () => roleApi.getAll(table.params),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const roles = rolesQuery.data?.result ?? EMPTY_ROLES;
  const total = rolesQuery.data?.pagination?.total ?? 0;

  // Filter/search làm tổng bản ghi giảm → lùi về trang cuối hợp lệ.
  useEffect(() => {
    clampPageIndex(total);
  }, [clampPageIndex, total]);

  const createRole = adminRoles.useCreate();
  const updateRole = adminRoles.useUpdate();
  const deleteRole = adminRoles.useDelete();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const columns = useMemo(
    () =>
      createRoleColumns({
        onEdit: (role) => {
          setEditing(role);
          setFormOpen(true);
        },
        onDelete: (role) => setDeleteTarget(role),
      }),
    [],
  );

  const handleSubmit = async (values: RoleInput) => {
    if (editing) {
      await updateRole.mutateAsync({ id: editing.id, data: values });
    } else {
      await createRole.mutateAsync(values);
    }
    setFormOpen(false);
    setEditing(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteRole.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Lỗi đã được toast trong mutation — giữ dialog mở để user thử lại.
    }
  };

  const hasQuery = Boolean(table.keyword) || table.filters.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <AdminPageHeader title={title} description={description} queryRoots={[['admin-roles']]} />
      <DataTableToolbar
        actions={
          <Button type="button" className="h-11 gap-2" onClick={openCreate}>
            <Plus className="size-4" aria-hidden />
            Thêm vai trò
          </Button>
        }
      >
        <div className="relative w-full sm:max-w-xs">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            type="search"
            value={table.keywordInput}
            onChange={(event) => table.setKeywordInput(event.target.value)}
            placeholder="Tìm theo tên hoặc mã vai trò…"
            className="h-11 pl-9"
            aria-label="Tìm kiếm vai trò"
          />
        </div>

        <FilterBuilder
          fields={ROLE_FILTER_FIELDS}
          value={table.filters}
          onChange={table.setFilters}
        />
      </DataTableToolbar>

      <ActiveFilterChips
        fields={ROLE_FILTER_FIELDS}
        value={table.filters}
        onRemove={table.removeFilter}
        onClear={table.clearFilters}
      />

      <DataTable
        columns={columns}
        data={roles}
        pagination={table.pagination}
        onPaginationChange={table.setPagination}
        sorting={table.sorting}
        onSortingChange={table.setSorting}
        rowCount={total}
        isLoading={rolesQuery.isLoading}
        isFetching={rolesQuery.isFetching}
        error={rolesQuery.error}
        onRetry={() => void rolesQuery.refetch()}
        empty={
          <EmptyState
            title={hasQuery ? 'Không tìm thấy vai trò phù hợp' : 'Chưa có vai trò nào'}
            description={
              hasQuery
                ? 'Thử thay đổi từ khóa hoặc bộ lọc để tìm kết quả khác.'
                : 'Thêm vai trò đầu tiên để bắt đầu phân quyền người dùng.'
            }
            action={
              hasQuery ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() => {
                    table.setKeywordInput('');
                    table.clearFilters();
                  }}
                >
                  Xóa tìm kiếm &amp; bộ lọc
                </Button>
              ) : (
                <Button type="button" className="h-11 gap-2" onClick={openCreate}>
                  <Plus className="size-4" aria-hidden />
                  Thêm vai trò
                </Button>
              )
            }
          />
        }
      />

      <DataTablePagination
        pageIndex={table.pageIndex}
        pageSize={table.pageSize}
        total={total}
        isFetching={rolesQuery.isFetching}
        onPageChange={table.setPageIndex}
        onPageSizeChange={table.setPageSize}
      />

      <RoleFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        role={editing}
        onSubmit={handleSubmit}
        submitting={createRole.isPending || updateRole.isPending}
      />

      <RoleDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        role={deleteTarget}
        onConfirm={handleDelete}
        deleting={deleteRole.isPending}
      />
    </div>
  );
}
