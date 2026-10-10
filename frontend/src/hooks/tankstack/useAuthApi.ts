import { authApi } from '@/apis/auth.api';
import { userApi } from '@/apis/user.api';
import { parseAxiosError } from '@/lib/axiosClient';
import { ApiResponse, UpdateProfileDto, User } from '@/shared/types/api.types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// send verification email
export function useSendVerificationEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await authApi.sendVerificationEmail();
      return response;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Gửi email xác minh thành công!');
    },
    onError: (error: any) => {
      const parsedError = parseAxiosError(error);
      toast.error(`Lỗi: ${parsedError.message || 'Vui lòng thử lại.'}`);
    },
  });
}

// verify email
export function useVerifyEmail() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (token: string) => {
      const response = await authApi.verifyEmail(token);
      return response;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Xác thực email thành công!');
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error: any) => {
      const parsedError = parseAxiosError(error);
      toast.error(`Lỗi: ${parsedError.message || 'Vui lòng thử lại.'}`);
    },
  });
}

const useAuthApi = {
  useSendVerificationEmail,
  useVerifyEmail,
};

export default useAuthApi;
