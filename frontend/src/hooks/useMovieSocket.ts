'use client';

import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import type { Comment } from '@/shared/types/comment.types';

/**
 * URL của Socket.IO — backend chạy HTTP API + WS cùng cổng (8081).
 * Derive từ `NEXT_PUBLIC_API_BASE_URL` (bỏ hậu tố `/api`) — không hardcode cổng.
 */
function getSocketUrl(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8081/api';
  return baseUrl.replace(/\/api\/?$/, '');
}

/**
 * **Một** socket dùng chung cho toàn app (tránh mở nhiều connection cho mỗi
 * widget ở trang chi tiết). Các hook chỉ subscribe/unsubscribe listener.
 */
let sharedSocket: Socket | null = null;
function getSharedSocket(): Socket {
  if (!sharedSocket) {
    sharedSocket = io(getSocketUrl(), {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
    });
  }
  return sharedSocket;
}

export interface MovieTypingPayload {
  isTyping: boolean;
  userFullName: string;
}

export interface MovieViewCountPayload {
  movieId: number | string;
  viewCount: number;
}

export interface MovieRatingPayload {
  movieStats?: { voteCount: number; voteAverage: number };
  [key: string]: unknown;
}

/** Payload `movie-{id}-interaction` — broadcast sau like/comment/click. */
export interface MovieInteractionPayload {
  movieId: number | string;
  type: string;
  action: 'added' | 'removed' | 'updated';
  score: number;
  likeCount: number;
  commentCount: number;
  viewCount: number;
}

interface UseMovieSocketOptions {
  movieId: number | string;
  /** `false` để tạm không subscribe (ví dụ card chỉ hiển thị nút). */
  enabled?: boolean;
  onComment?: (comment: Comment) => void;
  onRating?: (payload: MovieRatingPayload) => void;
  onViewCount?: (payload: MovieViewCountPayload) => void;
  onTyping?: (payload: MovieTypingPayload) => void;
  onInteraction?: (payload: MovieInteractionPayload) => void;
}

/**
 * Subscribe các event realtime theo phim trên **socket dùng chung**:
 * `movie-{id}-comment`, `movie-{id}-rating`, `movie-{id}-viewCount`,
 * `movie-{id}-typing`, `movie-{id}-interaction`. Cleanup khi unmount.
 *
 * Handler được giữ trong ref nên callback mới không gây subscribe lại.
 */
export function useMovieSocket({
  movieId,
  enabled = true,
  onComment,
  onRating,
  onViewCount,
  onTyping,
  onInteraction,
}: UseMovieSocketOptions) {
  const handlersRef = useRef({
    onComment,
    onRating,
    onViewCount,
    onTyping,
    onInteraction,
  });
  // Cập nhật handler ref trong effect (không ghi ref trong render — react-hooks/refs)
  useEffect(() => {
    handlersRef.current = {
      onComment,
      onRating,
      onViewCount,
      onTyping,
      onInteraction,
    };
  });

  useEffect(() => {
    if (!movieId || !enabled) return;

    const socket = getSharedSocket();

    const commentEvent = `movie-${movieId}-comment`;
    const ratingEvent = `movie-${movieId}-rating`;
    const viewCountEvent = `movie-${movieId}-viewCount`;
    const typingEvent = `movie-${movieId}-typing`;
    const interactionEvent = `movie-${movieId}-interaction`;

    const handleComment = (comment: Comment) => handlersRef.current.onComment?.(comment);
    const handleRating = (payload: MovieRatingPayload) => handlersRef.current.onRating?.(payload);
    const handleViewCount = (payload: MovieViewCountPayload) =>
      handlersRef.current.onViewCount?.(payload);
    const handleTyping = (payload: MovieTypingPayload) => handlersRef.current.onTyping?.(payload);
    const handleInteraction = (payload: MovieInteractionPayload) =>
      handlersRef.current.onInteraction?.(payload);

    socket.on(commentEvent, handleComment);
    socket.on(ratingEvent, handleRating);
    socket.on(viewCountEvent, handleViewCount);
    socket.on(typingEvent, handleTyping);
    socket.on(interactionEvent, handleInteraction);

    return () => {
      socket.off(commentEvent, handleComment);
      socket.off(ratingEvent, handleRating);
      socket.off(viewCountEvent, handleViewCount);
      socket.off(typingEvent, handleTyping);
      socket.off(interactionEvent, handleInteraction);
    };
  }, [movieId, enabled]);
}

/**
 * Gửi sự kiện "đang gõ bình luận" — server broadcast `movie-{id}-typing`
 * cho các client khác.
 */
export function emitTypingComment(
  movieId: number | string,
  isTyping: boolean,
  userFullName?: string
) {
  getSharedSocket().emit('typingComment', {
    movieId: Number(movieId),
    isTyping,
    userFullName,
  });
}

export function emitToggleLike(movieId: number | string, token?: string | null) {
  // Disabled: use REST mutations with WS broadcast
}

export function emitCreateRating(movieId: number | string, rating: number, token?: string | null) {
  // Disabled: use REST mutations with WS broadcast
}

export function emitCreateComment(
  movieId: number | string,
  content: string,
  token?: string | null,
  parentId?: number | string
) {
  // Disabled: use REST mutations with WS broadcast
}
