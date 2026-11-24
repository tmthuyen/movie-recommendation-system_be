import { MovieWithSimilarScore } from './movie.types';

/** Payload gửi câu hỏi tới `POST /api/chat`. */
export interface ChatRequest {
  message: string;
  topK?: number;
}

/** Kết quả trả về trong `response.result` của `POST /api/chat`. */
export interface ChatRagResponse {
  answer: string;
  movies: MovieWithSimilarScore[];
  intent?: string;
  statType?: string;
}

/** Tin nhắn trong khung hội thoại trợ lý phim AI. */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  movies?: MovieWithSimilarScore[];
  intent?: string;
  statType?: string;
  createdAt: string;
  isError?: boolean;
  isStreaming?: boolean;
  isStreamActive?: boolean;
}
