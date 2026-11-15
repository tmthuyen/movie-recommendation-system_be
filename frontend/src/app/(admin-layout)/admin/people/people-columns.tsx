'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import type { AdminTableFeatures } from '@/components/admin/data-view/features';
import type { AdminColumnDef } from '@/components/admin/data-view/types';
import { Button } from '@/components/ui/button';
import type { People } from '@/shared/types/movie.types';
import { formatShortDate } from '@/shared/utils/formatting';

const helper = createColumnHelper<AdminTableFeatures, People>();

export interface PeopleColumnsOptions {
  onEdit: (people: People) => void;
  onDelete: (people: People) => void;
}

/** Tên hiển thị — ưu tiên `fullName` (entity), fallback `name` (type cũ). */
function displayName(people: People): string {
  return people.fullName ?? people.name ?? `#${people.id}`;
}

/** Cột bảng diễn viên/đạo diễn — sort field khớp whitelist backend. */
export function createPeopleColumns({
  onEdit,
  onDelete,
}: PeopleColumnsOptions): AdminColumnDef<People>[] {
  return helper.columns([
    helper.accessor('id', {
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground font-mono text-xs">{String(getValue())}</span>
      ),
    }),
    helper.accessor('fullName', {
      header: 'Họ tên',
      cell: ({ row }) => (
        <span className="text-foreground font-medium">{displayName(row.original)}</span>
      ),
    }),
    helper.accessor('nationality', {
      header: 'Quốc tịch',
      cell: ({ getValue }) => {
        const nationality = getValue();
        return nationality ? (
          <span className="text-sm">{nationality}</span>
        ) : (
          <span className="text-muted-foreground/60 text-sm">—</span>
        );
      },
    }),
    helper.accessor('gender', {
      header: 'Giới tính',
      cell: ({ getValue }) => {
        const gender = getValue();
        return gender ? (
          <span className="text-muted-foreground text-sm">{gender}</span>
        ) : (
          <span className="text-muted-foreground/60 text-sm">—</span>
        );
      },
    }),
    helper.accessor('mainRole', {
      header: 'Vai trò chính',
      cell: ({ getValue }) => {
        const mainRole = getValue();
        return mainRole ? (
          <span className="bg-muted/60 text-foreground inline-flex rounded-md px-2 py-1 text-xs font-medium">
            {mainRole}
          </span>
        ) : (
          <span className="text-muted-foreground/60 text-sm">—</span>
        );
      },
    }),
    helper.accessor('birthDate', {
      header: 'Ngày sinh',
      cell: ({ getValue }) => {
        const birthDate = getValue();
        return birthDate ? (
          <span className="text-muted-foreground text-sm">{formatShortDate(birthDate)}</span>
        ) : (
          <span className="text-muted-foreground/60 text-sm">—</span>
        );
      },
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Thao tác</span>,
      enableSorting: false,
      cell: ({ row }) => {
        const people = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-11 cursor-pointer"
              onClick={() => onEdit(people)}
              aria-label={`Sửa ${displayName(people)}`}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive size-11 cursor-pointer"
              onClick={() => onDelete(people)}
              aria-label={`Xóa ${displayName(people)}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        );
      },
    }),
  ]);
}
