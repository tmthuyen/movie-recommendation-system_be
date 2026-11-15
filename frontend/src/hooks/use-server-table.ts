'use client';

import type { PaginationState, SortingState } from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { buildFilterString, buildSortString, type ActiveFilter } from '@/shared/utils/search-query';
import { useDebounce } from './use-debounce';

/** Query params gửi các endpoint admin dùng `BaseSearchRequest`. */
export interface ServerTableParams {
  page: number;
  limit: number;
  keyword?: string;
  filters?: string[];
  sort?: string[];
}

export interface UseServerTableOptions {
  initialPageSize?: number;
  initialSorting?: SortingState;
  initialFilters?: ActiveFilter[];
  /** Thời gian debounce ô tìm kiếm (ms). */
  debounceMs?: number;
  /**
   * Filter luôn gửi kèm mà không hiện trong UI (vd. tab chỉ xem một loại
   * tương tác). Giữ tham chiếu ổn định (hằng số ngoài component).
   */
  lockedFilters?: string[];
}

const EMPTY_LOCKED_FILTERS: string[] = [];

/**
 * State dùng chung cho bảng server-side: phân trang, sort, keyword (debounce)
 * và bộ lọc nâng cao. Không phụ thuộc React Query — trang tự gọi API từ `params`.
 *
 * Mọi thay đổi điều kiện truy vấn (keyword/filters/sorting) tự đưa về trang 1.
 */
export function useServerTable({
  initialPageSize = 10,
  initialSorting = [],
  initialFilters = [],
  debounceMs = 350,
  lockedFilters = EMPTY_LOCKED_FILTERS,
}: UseServerTableOptions = {}) {
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: initialPageSize,
  });
  const [sorting, setSortingState] = useState<SortingState>(initialSorting);
  const [filters, setFiltersState] = useState<ActiveFilter[]>(initialFilters);
  const [keywordInput, setKeywordInputState] = useState('');

  const keyword = useDebounce(keywordInput.trim(), debounceMs);

  const resetToFirstPage = useCallback(() => {
    setPagination((prev) => (prev.pageIndex === 0 ? prev : { ...prev, pageIndex: 0 }));
  }, []);

  const setKeywordInput = useCallback(
    (value: string) => {
      setKeywordInputState(value);
      resetToFirstPage();
    },
    [resetToFirstPage],
  );

  const setSorting = useCallback(
    (updater: SortingState | ((prev: SortingState) => SortingState)) => {
      setSortingState(updater);
      resetToFirstPage();
    },
    [resetToFirstPage],
  );

  const setFilters = useCallback(
    (next: ActiveFilter[]) => {
      setFiltersState(next);
      resetToFirstPage();
    },
    [resetToFirstPage],
  );

  const removeFilter = useCallback(
    (id: string) => {
      setFiltersState((prev) => prev.filter((filter) => filter.id !== id));
      resetToFirstPage();
    },
    [resetToFirstPage],
  );

  const clearFilters = useCallback(() => {
    setFiltersState([]);
    resetToFirstPage();
  }, [resetToFirstPage]);

  const sort = useMemo(() => buildSortString(sorting), [sorting]);
  const activeFilters = useMemo(() => filters.map(buildFilterString), [filters]);

  const params = useMemo<ServerTableParams>(() => {
    const mergedFilters =
      lockedFilters.length > 0 ? [...lockedFilters, ...activeFilters] : activeFilters;

    return {
      page: pagination.pageIndex + 1,
      limit: pagination.pageSize,
      ...(keyword ? { keyword } : {}),
      ...(mergedFilters.length > 0 ? { filters: mergedFilters } : {}),
      ...(sort ? { sort: [sort] } : {}),
    };
  }, [pagination.pageIndex, pagination.pageSize, keyword, activeFilters, lockedFilters, sort]);

  const setPageIndex = useCallback((pageIndex: number) => {
    setPagination((prev) => ({ ...prev, pageIndex: Math.max(0, pageIndex) }));
  }, []);

  const setPageSize = useCallback((pageSize: number) => {
    setPagination({ pageIndex: 0, pageSize });
  }, []);

  /** Giữ trang hiện tại trong khoảng hợp lệ sau khi tổng bản ghi thay đổi. */
  const clampPageIndex = useCallback(
    (total: number) => {
      const totalPages = Math.max(1, Math.ceil(total / pagination.pageSize));
      setPagination((prev) =>
        prev.pageIndex > totalPages - 1 ? { ...prev, pageIndex: totalPages - 1 } : prev,
      );
    },
    [pagination.pageSize],
  );

  const reset = useCallback(() => {
    setKeywordInputState('');
    setFiltersState(initialFilters);
    setSortingState(initialSorting);
    setPagination({ pageIndex: 0, pageSize: initialPageSize });
  }, [initialFilters, initialPageSize, initialSorting]);

  return {
    // state
    pagination,
    sorting,
    filters,
    keyword,
    keywordInput,
    params,
    pageIndex: pagination.pageIndex,
    pageSize: pagination.pageSize,
    // setters
    setPagination,
    setSorting,
    setFilters,
    setKeywordInput,
    setPageIndex,
    setPageSize,
    removeFilter,
    clearFilters,
    clampPageIndex,
    reset,
  };
}

export type ServerTableState = ReturnType<typeof useServerTable>;
