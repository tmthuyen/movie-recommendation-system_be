import { ApiPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import type { FailedEvent } from '@/shared/types/failed-event.types';
import { withListParams, type SearchListParams } from '@/shared/utils/list-params';
import axiosClient from '@/lib/axiosClient';

export const failedEventApi = {
  /** Danh sách sự kiện lỗi — `GET /api/failed-events` (admin). */
  getAll: async (params: SearchListParams = {}): Promise<ApiPaginatedResponse<FailedEvent[]>> => {
    const { data } = await axiosClient.get(withListParams('/failed-events', params));
    return data;
  },
  /**
   * Phát lại sự kiện — `POST /api/failed-events/:id/retry`.
   * Response chỉ có `{success, statusCode, message}` (không có `result`).
   */
  retry: async (id: string): Promise<ApiResponse<null>> => {
    const { data } = await axiosClient.post(`/failed-events/${id}/retry`);
    return data;
  },
};
