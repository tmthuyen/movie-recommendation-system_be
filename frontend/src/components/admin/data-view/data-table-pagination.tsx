'use client';

import { DataPagination } from '@/components/common/DataPagination';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { DataTablePaginationProps } from './types';

const PAGE_SIZE_OPTIONS = [2, 5, 10, 20, 50, 100];

/**
 * Thanh phân trang admin: tổng bản ghi, chọn limit và dải số trang.
 * Dải số trang dùng chung `DataPagination` để giống các trang khác trong app
 * (không dùng ô nhập số trang).
 */
export function DataTablePagination({
  pageIndex,
  pageSize,
  total,
  isFetching = false,
  onPageChange,
  onPageSizeChange,
}: DataTablePaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pageCount, Math.max(1, pageIndex + 1));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground text-sm" aria-live="polite">
        {total === 0 ? (
          'Không có bản ghi'
        ) : (
          <>
            Hiển thị{' '}
            <span className="text-foreground font-medium">
              {from}–{to}
            </span>{' '}
            / {total} bản ghi
          </>
        )}
        {isFetching ? <span className="ml-2 text-xs">· Đang tải…</span> : null}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Số dòng</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger className="h-11 w-[84px] cursor-pointer" aria-label="Số dòng mỗi trang">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)} className="cursor-pointer">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataPagination
          page={page}
          totalPages={pageCount}
          onPageChange={(nextPage) => onPageChange(nextPage - 1)}
          disabled={isFetching}
          showSummary={false}
          className="mt-0 border-t-0 py-0"
        />
      </div>
    </div>
  );
}
