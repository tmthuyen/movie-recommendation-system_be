import { aiConfigApi, type AIConfigValue } from '@/apis/ai-config.api';
import { parseAxiosError } from '@/lib/axiosClient';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/** Root queryKey của trang cấu hình AI — dùng cho refresh và invalidate sau lưu. */
export const AI_CONFIG_QUERY_ROOT = 'admin-ai-config';

export function useAdminAIConfig() {
  return useQuery({
    queryKey: [AI_CONFIG_QUERY_ROOT],
    queryFn: async () => {
      const response = await aiConfigApi.getAll();
      return response.result;
    },
    staleTime: 30_000,
  });
}

export function useUpdateAIConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (changes: Record<string, AIConfigValue>) => aiConfigApi.update(changes),
    onSuccess: (response) => {
      toast.success(response.message || 'Cập nhật cấu hình AI thành công.');
      void queryClient.invalidateQueries({ queryKey: [AI_CONFIG_QUERY_ROOT] });
    },
    onError: (error) => {
      toast.error(parseAxiosError(error).message || 'Không thể cập nhật cấu hình AI.');
    },
  });
}
