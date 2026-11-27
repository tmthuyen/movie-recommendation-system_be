'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { Eye, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AdminTableFeatures } from '@/components/admin/data-view/features';
import type { AdminColumnDef } from '@/components/admin/data-view/types';
import type { User } from '@/shared/types/api.types';
import { formatDateTime } from '@/shared/utils/formatting';
import { mapUserStatus } from '@/shared/utils/mapStatus';

const helper = createColumnHelper<AdminTableFeatures, User>();

export interface UserColumnsOptions {
  onEdit: (user: User) => void;
  onViewDetails: (user: User) => void;
  onAssignRoles: (user: User) => void;
  onDelete: (user: User) => void;
}

/** Chữ cái đầu của họ tên để hiển thị avatar fallback. */
function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Cột bảng người dùng — sort field khớp whitelist backend. */
export function createUserColumns({
  onEdit,
  onViewDetails,
  onAssignRoles,
  onDelete,
}: UserColumnsOptions): AdminColumnDef<User>[] {
  return helper.columns([
    helper.accessor('id', {
      header: 'ID',
      cell: ({ getValue }) => {
        const id = String(getValue() ?? '');
        return (
          <span
            className="text-muted-foreground block max-w-[110px] truncate font-mono text-xs"
            title={id}
          >
            {id}
          </span>
        );
      },
    }),
    helper.accessor('fullName', {
      header: 'Người dùng',
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex min-w-0 items-center gap-3">
            <Avatar size="sm" className="shrink-0">
              <AvatarImage src={user.avatarUrl} alt="" />
              <AvatarFallback>{initials(user.fullName ?? '') || '?'}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="text-foreground truncate font-medium">{user.fullName}</span>
              <span className="text-muted-foreground truncate text-xs">{user.email}</span>
            </div>
          </div>
        );
      },
    }),
    helper.accessor('status', {
      header: 'Trạng thái',
      cell: ({ getValue }) => {
        const status = mapUserStatus(getValue() ?? 'UNKNOWN');
        return (
          <Badge variant="outline" className={status.color}>
            {status.label}
          </Badge>
        );
      },
    }),
    helper.accessor('isVerified', {
      header: 'Xác thực',
      cell: ({ getValue }) => (
        <Badge variant={getValue() ? 'secondary' : 'outline'}>
          {getValue() ? 'Đã xác thực' : 'Chưa xác thực'}
        </Badge>
      ),
    }),
    helper.display({
      id: 'roles',
      header: 'Vai trò',
      enableSorting: false,
      cell: ({ row }) => {
        const roles = row.original.roles ?? [];
        if (roles.length === 0) {
          return <span className="text-muted-foreground/60 text-sm">—</span>;
        }
        return (
          <div className="flex flex-wrap gap-1">
            {roles.map((role) => (
              <Badge key={role.id} variant="secondary" className="font-mono text-[11px]">
                {role.code}
              </Badge>
            ))}
          </div>
        );
      },
    }),
    helper.accessor('phoneNumber', {
      header: 'Điện thoại',
      enableSorting: false,
      cell: ({ getValue }) => {
        const phoneNumber = getValue();
        return phoneNumber ? (
          <span className="text-muted-foreground text-sm">{phoneNumber}</span>
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
    helper.accessor('updatedAt', {
      header: 'Ngày cập nhật',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground text-sm">{formatDateTime(getValue())}</span>
      ),
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const user = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-11 cursor-pointer"
              onClick={() => onViewDetails(user)}
              aria-label={`Xem chi tiết người dùng ${user.fullName}`}
            >
              <Eye className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-11 cursor-pointer"
              onClick={() => onEdit(user)}
              aria-label={`Sửa người dùng ${user.fullName}`}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-11 cursor-pointer"
              onClick={() => onAssignRoles(user)}
              aria-label={`Gán vai trò cho ${user.fullName}`}
            >
              <ShieldCheck className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive size-11 cursor-pointer"
              onClick={() => onDelete(user)}
              aria-label={`Xóa người dùng ${user.fullName}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        );
      },
    }),
  ]);
}
