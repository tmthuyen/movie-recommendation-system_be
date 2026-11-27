import { failedEventApi } from '@/apis/failed-event.api';
import { parseAxiosError } from '@/lib/axiosClient';
import type { FailedEvent } from '@/shared/types/failed-event.types';
import type { SearchListParams } from '@/shared/utils/list-params';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { usePagedList } from './admin-crud';

/** Root queryKey của trang sự kiện lỗi — dùng cho nút làm mới và sau retry. */
export const FAILED_EVENTS_QUERY_ROOT = 'admin-failed-events';

/* eslint-disable react-hooks/rules-of-hooks -- usePagedList là FACTORY (trả về hook), không gọi hook nào khi chạy ở module level; xem admin-crud.ts */
const useFailedEventsList = usePagedList<FailedEvent>(
  FAILED_EVENTS_QUERY_ROOT,
  failedEventApi.getAll,
);
/* eslint-enable react-hooks/rules-of-hooks */

/** Danh sách sự kiện rớt DLQ, phân trang theo `BaseSearchRequest`. */
export function useAdminFailedEvents(params: SearchListParams & { enabled?: boolean } = {}) {
  return useFailedEventsList(params);
}

/** Phát lại một sự kiện lỗi; làm mới danh sách sau khi phát lại thành công. */
export function useRetryFailedEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => failedEventApi.retry(id),
    onSuccess: (response) => {
      toast.success(response.message || 'Đã phát lại sự kiện.');
      void queryClient.invalidateQueries({ queryKey: [FAILED_EVENTS_QUERY_ROOT] });
    },
    onError: (error) => {
      toast.error(parseAxiosError(error).message || 'Không thể phát lại sự kiện.');
    },
  });
}
