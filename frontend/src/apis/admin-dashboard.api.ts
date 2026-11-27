import axiosClient from '@/lib/axiosClient';
import { ApiResponse } from '@/shared/types/api.types';
import type {
  AdminDashboardParams,
  AdminDashboardStats,
} from '@/shared/types/admin-dashboard.types';

export const adminDashboardApi = {
  /**
   * Thống kê tổng hợp của dashboard admin.
   * `GET /api/admin/dashboard/stats?period=...&from=...&to=...`
   */
  getStats: async ({
    period,
    from,
    to,
  }: AdminDashboardParams): Promise<ApiResponse<AdminDashboardStats>> => {
    const { data } = await axiosClient.get('/admin/dashboard/stats', {
      params: {
        period,
        ...(period === 'custom' ? { from, to } : {}),
      },
    });
    return data;
  },
};
