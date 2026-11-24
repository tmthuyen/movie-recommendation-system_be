import { ApiResponse } from '@/shared/types/api.types';
import { ChatRagResponse, ChatRequest } from '@/shared/types/chat.types';
import { MovieWithSimilarScore } from '@/shared/types/movie.types';
import axiosClient from '@/lib/axiosClient';

export interface ChatStreamHandlers {
  onMetadata?: (data: {
    intent?: string;
    statType?: string;
    movies?: MovieWithSimilarScore[];
  }) => void;
  onToken?: (token: string) => void;
  onDone?: () => void;
  onError?: (error: Error) => void;
}

export const chatApi = {
  /** Gửi câu hỏi tới trợ lý phim AI (`POST /api/chat`). */
  ask: async (payload: ChatRequest): Promise<ApiResponse<ChatRagResponse>> => {
    const { data } = await axiosClient.post('/chat', payload);
    return data;
  },

  /** Gửi câu hỏi tới trợ lý phim AI dạng Server-Sent Events (SSE Stream). */
  askStream: async (
    payload: ChatRequest,
    handlers: ChatStreamHandlers,
    signal?: AbortSignal,
  ): Promise<void> => {
    const baseURL =
      process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000/api';
    const url = `${baseURL}/chat/stream`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
        signal,
      });
    } catch (err) {
      if (signal?.aborted) return;
      const error =
        err instanceof Error
          ? err
          : new Error('Không thể kết nối tới máy chủ.');
      handlers.onError?.(error);
      return;
    }

    if (!response.ok) {
      let errorMsg = 'Có lỗi xảy ra khi kết nối trợ lý AI.';
      try {
        const errorData = (await response.json()) as { message?: string };
        if (errorData?.message) {
          errorMsg = errorData.message;
        }
      } catch {
        if (response.status === 429) {
          errorMsg =
            'Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi 1 phút trước khi hỏi tiếp để tránh spam hệ thống.';
        }
      }
      handlers.onError?.(new Error(errorMsg));
      return;
    }

    if (!response.body) {
      handlers.onError?.(new Error('Phản hồi từ máy chủ không hợp lệ.'));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const trimmed = block.trim();
          if (!trimmed.startsWith('data:')) continue;
          const jsonStr = trimmed.slice(5).trim();
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr) as {
              event: string;
              intent?: string;
              statType?: string;
              movies?: MovieWithSimilarScore[];
              text?: string;
              message?: string;
            };

            if (data.event === 'metadata') {
              handlers.onMetadata?.({
                intent: data.intent,
                statType: data.statType,
                movies: data.movies || [],
              });
            } else if (data.event === 'token') {
              handlers.onToken?.(data.text || '');
            } else if (data.event === 'done') {
              handlers.onDone?.();
            } else if (data.event === 'error') {
              handlers.onError?.(new Error(data.message || 'Lỗi trợ lý AI'));
            }
          } catch {
            // Bỏ qua chunk bị lỗi parse
          }
        }
      }
      handlers.onDone?.();
    } catch (err) {
      if (!signal?.aborted) {
        const error =
          err instanceof Error
            ? err
            : new Error('Lỗi trong quá trình nhận phản hồi.');
        handlers.onError?.(error);
      }
    }
  },
};
