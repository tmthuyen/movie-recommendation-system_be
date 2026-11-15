'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import type { AdminColumnDef } from '@/components/admin/data-view/types';
import type { AdminTableFeatures } from '@/components/admin/data-view/features';
import { Button } from '@/components/ui/button';
import type { Role } from '@/shared/types/api.types';
import { formatDateTime } from '@/shared/utils/formatting';

const helper = createColumnHelper<AdminTableFeatures, Role>();

export interface RoleColumnsOptions {
  onEdit: (role: Role) => void;
  onDelete: (role: Role) => void;
}

/**
 * Cột bảng vai trò.
 * Sort field khớp whitelist backend: `code`, `name`, `createdAt` (và `id`).
 */
export function createRoleColumns({
  onEdit,
  onDelete,
}: RoleColumnsOptions): AdminColumnDef<Role>[] {
  return helper.columns([
    helper.accessor('id', {
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground font-mono text-xs">{String(getValue())}</span>
      ),
    }),
    helper.accessor('code', {
      header: 'Mã vai trò',
      cell: ({ getValue }) => (
        <span className="bg-muted/60 text-foreground inline-flex rounded-md px-2 py-1 font-mono text-xs font-semibold tracking-wide">
          {getValue()}
        </span>
      ),
    }),
    helper.accessor('name', {
      header: 'Tên vai trò',
      cell: ({ getValue }) => <span className="text-foreground font-medium">{getValue()}</span>,
    }),
    helper.accessor('description', {
      header: 'Mô tả',
      enableSorting: false,
      cell: ({ getValue }) => {
        const description = getValue();
        return description ? (
          <span className="text-muted-foreground line-clamp-2 block max-w-[360px] text-sm">
            {description}
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-sm">—</span>
        );
      },
    }),
    helper.accessor('createdAt', {
      header: 'Ngày tạo',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground text-sm">{formatDateTime(getValue())}</span>
      ),
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const role = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-11 cursor-pointer"
              onClick={() => onEdit(role)}
              aria-label={`Sửa vai trò ${role.name}`}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive size-11 cursor-pointer"
              onClick={() => onDelete(role)}
              aria-label={`Xóa vai trò ${role.name}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        );
      },
    }),
  ]);
}
