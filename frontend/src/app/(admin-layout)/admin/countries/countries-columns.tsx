'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { Pencil, Trash2 } from 'lucide-react';
import type { AdminTableFeatures } from '@/components/admin/data-view/features';
import type { AdminColumnDef } from '@/components/admin/data-view/types';
import { Button } from '@/components/ui/button';
import type { Country } from '@/shared/types/movie.types';

const helper = createColumnHelper<AdminTableFeatures, Country>();

export interface CountryColumnsOptions {
  onEdit: (country: Country) => void;
  onDelete: (country: Country) => void;
}

/** Cột bảng quốc gia — sort field khớp whitelist backend. */
export function createCountryColumns({
  onEdit,
  onDelete,
}: CountryColumnsOptions): AdminColumnDef<Country>[] {
  return helper.columns([
    helper.accessor('id', {
      header: 'ID',
      cell: ({ getValue }) => (
        <span className="text-muted-foreground font-mono text-xs">{String(getValue())}</span>
      ),
    }),
    helper.accessor('viName', {
      header: 'Tên (tiếng Việt)',
      cell: ({ getValue }) => <span className="text-foreground font-medium">{getValue()}</span>,
    }),
    helper.accessor('enName', {
      header: 'Tên (tiếng Anh)',
      cell: ({ getValue }) => <span className="text-muted-foreground text-sm">{getValue()}</span>,
    }),
    helper.accessor('code', {
      header: 'Mã',
      cell: ({ getValue }) => (
        <span className="bg-muted/60 text-foreground inline-flex rounded-md px-2 py-1 font-mono text-xs font-semibold tracking-wide">
          {getValue()}
        </span>
      ),
    }),
    helper.accessor('region', {
      header: 'Khu vực',
      cell: ({ getValue }) => <span className="text-sm">{getValue()}</span>,
    }),
    helper.accessor('subregion', {
      header: 'Tiểu vùng',
      enableSorting: false,
      cell: ({ getValue }) => {
        const subregion = getValue();
        return subregion ? (
          <span className="text-muted-foreground text-sm">{subregion}</span>
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
        const country = row.original;
        return (
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground size-11 cursor-pointer"
              onClick={() => onEdit(country)}
              aria-label={`Sửa quốc gia ${country.viName}`}
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive size-11 cursor-pointer"
              onClick={() => onDelete(country)}
              aria-label={`Xóa quốc gia ${country.viName}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </div>
        );
      },
    }),
  ]);
}
