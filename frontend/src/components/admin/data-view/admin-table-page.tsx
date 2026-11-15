'use client';

import type { RowData } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ServerTableState } from '@/hooks/use-server-table';
import type { FilterFieldConfig } from '@/shared/utils/search-query';
import { ActiveFilterChips } from './active-filter-chips';
import { DataTable } from './data-table';
import { DataTablePagination } from './data-table-pagination';
import { DataTableToolbar } from './data-table-toolbar';
import { FilterBuilder } from './filter-builder';
import type { AdminColumnDef } from './types';

export interface AdminTablePageProps<TData extends RowData> {
  /** State server-side table của trang (search/filter/sort/pagination). */
  table: ServerTableState;
  columns: AdminColumnDef<TData>[];
  data: TData[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  error: unknown;
  onRetry: () => void;
  searchPlaceholder: string;
  searchLabel: string;
  filterFields: FilterFieldConfig[];
  /** Danh từ số nhiều (vd. "thể loại") — dùng cho empty state. */
  entityLabel: string;
  /** Mô tả khi danh sách trống hoàn toàn (chưa có bản ghi nào). */
  emptyDescription: string;
  addLabel?: string;
  onAdd?: () => void;
  /** Nút/hành động bổ sung cạnh nút thêm (vd. chuyển chế độ xem bảng/lưới). */
  toolbarActions?: ReactNode;
  /** Thay bảng mặc định bằng nội dung khác (vd. grid view) — vẫn dùng chung toolbar/phân trang. */
  body?: ReactNode;
  /** Slot dialog (form/delete) render sau bảng. */
  children?: ReactNode;
}

/**
 * Khung trang danh sách admin: toolbar (search + filter + nút thêm), chip lọc,
 * bảng server-side, phân trang dạng dải số trang và slot dialog.
 * Không biết gì về domain — mỗi trang chỉ truyền columns/fields/data.
 */
export function AdminTablePage<TData extends RowData>({
  table,
  columns,
  data,
  total,
  isLoading,
  isFetching,
  error,
  onRetry,
  searchPlaceholder,
  searchLabel,
  filterFields,
  entityLabel,
  emptyDescription,
  addLabel,
  onAdd,
  toolbarActions,
  body,
  children,
}: AdminTablePageProps<TData>) {
  const hasQuery = Boolean(table.keyword) || table.filters.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar
        actions={
          toolbarActions || (onAdd && addLabel) ? (
            <div className="flex flex-wrap items-center gap-2">
              {toolbarActions}
              {onAdd && addLabel ? (
                <Button type="button" className="h-11 cursor-pointer gap-2" onClick={onAdd}>
                  <Plus className="size-4" aria-hidden />
                  {addLabel}
                </Button>
              ) : null}
            </div>
          ) : null
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
            placeholder={searchPlaceholder}
            className="h-11 pl-9"
            aria-label={searchLabel}
          />
        </div>

        <FilterBuilder fields={filterFields} value={table.filters} onChange={table.setFilters} />
      </DataTableToolbar>

      <ActiveFilterChips
        fields={filterFields}
        value={table.filters}
        onRemove={table.removeFilter}
        onClear={table.clearFilters}
      />

      {body ?? (
        <DataTable
          columns={columns}
          data={data}
          pagination={table.pagination}
          onPaginationChange={table.setPagination}
          sorting={table.sorting}
          onSortingChange={table.setSorting}
          rowCount={total}
          isLoading={isLoading}
          isFetching={isFetching}
          error={error}
          onRetry={onRetry}
          empty={
            <EmptyState
              title={
                hasQuery ? `Không tìm thấy ${entityLabel} phù hợp` : `Chưa có ${entityLabel} nào`
              }
              description={
                hasQuery
                  ? 'Thử thay đổi từ khóa hoặc bộ lọc để tìm kết quả khác.'
                  : emptyDescription
              }
              action={
                hasQuery ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11 cursor-pointer"
                    onClick={() => {
                      table.setKeywordInput('');
                      table.clearFilters();
                    }}
                  >
                    Xóa tìm kiếm &amp; bộ lọc
                  </Button>
                ) : onAdd && addLabel ? (
                  <Button type="button" className="h-11 cursor-pointer gap-2" onClick={onAdd}>
                    <Plus className="size-4" aria-hidden />
                    {addLabel}
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      <DataTablePagination
        pageIndex={table.pageIndex}
        pageSize={table.pageSize}
        total={total}
        isFetching={isFetching}
        onPageChange={table.setPageIndex}
        onPageSizeChange={table.setPageSize}
      />

      {children}
    </div>
  );
}
