import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { chatApi } from '@/apis/chat.api';
import { parseAxiosError } from '@/lib/axiosClient';
import { ChatRagResponse, ChatRequest } from '@/shared/types/chat.types';

/** Hook gọi API hỏi trợ lý phim AI (`POST /api/chat`). */
export function useAskChat() {
  return useMutation<ChatRagResponse, unknown, ChatRequest>({
    mutationKey: ['chat', 'ask'],
    mutationFn: async (payload: ChatRequest) => {
      const response = await chatApi.ask(payload);
      return response.result;
    },
    onError: (error) => {
      const { message } = parseAxiosError(error);
      toast.error(message);
    },
  });
}

const useChat = {
  useAskChat,
};

export default useChat;
