'use client';

import type { RowData } from '@tanstack/react-table';
import { useTable } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { ErrorState } from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { adminTableFeatures } from './features';
import type { DataTableProps } from './types';

/**
 * Bảng dữ liệu server-side dùng TanStack Table v9.
 *
 * Chỉ chịu trách nhiệm render: cột, sort header, trạng thái loading/empty/error
 * và cuộn ngang trên mobile. Mọi state (pagination/sorting) do trang kiểm soát.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  rowCount,
  isLoading = false,
  isFetching = false,
  error,
  onRetry,
  empty,
  skeletonRows = 5,
}: DataTableProps<TData>) {
  const table = useTable<typeof adminTableFeatures, TData>({
    features: adminTableFeatures,
    columns,
    data,
    state: { pagination, sorting },
    onPaginationChange,
    onSortingChange,
    manualPagination: true,
    manualSorting: true,
    rowCount,
    enableSortingRemoval: false,
    enableMultiSort: false,
    autoResetPageIndex: false,
  });

  if (error) {
    return (
      <div className="neo-surface rounded-2xl p-4">
        <ErrorState
          title="Không thể tải dữ liệu"
          description="Đã xảy ra lỗi khi tải danh sách. Vui lòng thử lại."
          onRetry={onRetry}
          className="border-0 bg-transparent shadow-none"
        />
      </div>
    );
  }

  const rows = table.getRowModel().rows;
  const columnCount = columns.length;

  return (
    <div className="neo-surface relative overflow-hidden rounded-2xl">
      {isFetching && !isLoading ? (
        <div
          className="bg-primary/70 absolute inset-x-0 top-0 z-10 h-0.5 animate-pulse motion-reduce:animate-none"
          aria-hidden
        />
      ) : null}

      <Table aria-busy={isLoading || isFetching}>
        <TableHeader className="bg-foreground/[0.03]">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                const ariaSort =
                  sorted === 'asc'
                    ? 'ascending'
                    : sorted === 'desc'
                      ? 'descending'
                      : canSort
                        ? 'none'
                        : undefined;

                return (
                  <TableHead
                    key={header.id}
                    aria-sort={ariaSort}
                    className="text-muted-foreground h-11 px-4 text-xs font-semibold tracking-wide uppercase"
                  >
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring hover:bg-foreground/5 -mx-2 flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md px-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                      >
                        <table.FlexRender header={header} />
                        {sorted === 'asc' ? (
                          <ArrowUp className="size-3.5" aria-hidden />
                        ) : sorted === 'desc' ? (
                          <ArrowDown className="size-3.5" aria-hidden />
                        ) : (
                          <ArrowUpDown className="size-3.5 opacity-40" aria-hidden />
                        )}
                      </button>
                    ) : (
                      <table.FlexRender header={header} />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {isLoading ? (
            Array.from({ length: skeletonRows }).map((_, rowIndex) => (
              <TableRow key={`skeleton-${rowIndex}`} className="hover:bg-transparent">
                {Array.from({ length: columnCount }).map((_, columnIndex) => (
                  <TableCell key={`skeleton-cell-${columnIndex}`} className="px-4 py-3">
                    <Skeleton
                      className={cn('h-4', columnIndex === 0 ? 'w-24' : 'w-full max-w-[180px]')}
                    />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columnCount} className="p-0">
                <div className="p-4">
                  {empty ?? (
                    <p className="text-muted-foreground py-8 text-center text-sm">
                      Không có bản ghi nào.
                    </p>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className="hover:bg-foreground/[0.04]">
                {row.getAllCells().map((cell) => (
                  <TableCell key={cell.id} className="px-4 py-3 align-middle">
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
