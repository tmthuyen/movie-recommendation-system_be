import type {
  ColumnDef,
  OnChangeFn,
  PaginationState,
  RowData,
  SortingState,
} from '@tanstack/react-table';
import type { ReactNode } from 'react';
import type { ActiveFilter, FilterFieldConfig } from '@/shared/utils/search-query';
import type { AdminTableFeatures } from './features';

/** Column definition gắn với feature set của bảng admin. */
export type AdminColumnDef<TData extends RowData> = ColumnDef<AdminTableFeatures, TData>;

export interface DataTableProps<TData extends RowData> {
  columns: AdminColumnDef<TData>[];
  /** Mảng phải ổn định identity (dùng hằng EMPTY_* ở module scope khi chưa có data). */
  data: TData[];
  pagination: PaginationState;
  onPaginationChange: OnChangeFn<PaginationState>;
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  /** Tổng số bản ghi server-side — dùng cho `manualPagination`. */
  rowCount: number;
  isLoading?: boolean;
  /** Đang refetch (giữ data cũ) — hiển thị thanh tiến trình mảnh. */
  isFetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Nội dung thay thế khi không có bản ghi. */
  empty?: ReactNode;
  skeletonRows?: number;
}

export interface DataTablePaginationProps {
  pageIndex: number;
  pageSize: number;
  total: number;
  isFetching?: boolean;
  onPageChange: (pageIndex: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export interface DataTableToolbarProps {
  /** Slot trái: ô tìm kiếm, filter, view toggle… */
  children?: ReactNode;
  /** Slot phải: nút thêm mới, export… */
  actions?: ReactNode;
}

export interface FilterBuilderProps {
  fields: FilterFieldConfig[];
  value: ActiveFilter[];
  onChange: (filters: ActiveFilter[]) => void;
  disabled?: boolean;
}

export interface ActiveFilterChipsProps {
  fields: FilterFieldConfig[];
  value: ActiveFilter[];
  onRemove: (id: string) => void;
  onClear: () => void;
}
