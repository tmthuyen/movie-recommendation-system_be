'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import type { AdminTableFeatures } from '@/components/admin/data-view/features';
import type { AdminColumnDef } from '@/components/admin/data-view/types';
import { Button } from '@/components/ui/button';
import type { Genre } from '@/shared/types/api.types';

const helper = createColumnHelper<AdminTableFeatures, Genre>();

export interface GenreColumnsOptions {
  onEdit: (genre: Genre) => void;
  onDelete: (genre: Genre) => void;
}

/** Cột bảng thể loại — sort field khớp whitelist backend. */
export function createGenreColumns({
  onEdit,
  onDelete,
}: GenreColumnsOptions): AdminColumnDef<Genre>[] {
  return helper.columns([
    helper.accessor('id', {
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground font-mono text-xs">{getValue()}</span>
      ),
    }),
    helper.accessor('name', {
      header: 'Tên thể loại',
      cell: ({ getValue }) => <span className="text-foreground font-medium">{getValue()}</span>,
    }),
    helper.accessor('enName', {
      header: 'Tên tiếng Anh',
      cell: ({ getValue }) => {
        const enName = getValue();
        return enName ? (
          <span className="text-muted-foreground text-sm">{enName}</span>
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
        const genre = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-11 cursor-pointer"
              onClick={() => onEdit(genre)}
              aria-label={`Sửa thể loại ${genre.name}`}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive size-11 cursor-pointer"
              onClick={() => onDelete(genre)}
              aria-label={`Xóa thể loại ${genre.name}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        );
      },
    }),
  ]);
}
