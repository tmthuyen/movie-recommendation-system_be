import { rowPaginationFeature, rowSortingFeature, tableFeatures } from '@tanstack/react-table';

/**
 * Feature set dùng chung cho bảng admin (TanStack Table v9).
 * Thứ tự: sort trước pagination để row model xử lý đúng thứ tự khi cần.
 */
export const adminTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
});

export type AdminTableFeatures = typeof adminTableFeatures;
