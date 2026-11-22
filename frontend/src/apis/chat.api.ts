import { ApiResponse } from '@/shared/types/api.types';
import { ChatRagResponse, ChatRequest } from '@/shared/types/chat.types';
import axiosClient from '@/lib/axiosClient';

export const chatApi = {
  /** Gửi câu hỏi tới trợ lý phim AI (`POST /api/chat`). */
  ask: async (payload: ChatRequest): Promise<ApiResponse<ChatRagResponse>> => {
    const { data } = await axiosClient.post('/chat', payload);
    return data;
  },
};
