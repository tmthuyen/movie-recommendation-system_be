'use client';

import React, { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import {
  Bot,
  Film,
  Maximize2,
  MessageCircle,
  Minimize2,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  User,
  X,
} from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { chatApi } from '@/apis/chat.api';
import { useAskChat } from '@/hooks/tankstack/useChat';
import { parseAxiosError } from '@/lib/axiosClient';
import { MOTION_DURATION_FAST, MOTION_EASE } from '@/lib/motion';
import { cn } from '@/lib/utils';
import { MovieWithSimilarScore } from '@/shared/types/movie.types';
import { getMovieTitle, getPosterUrl, getReleaseYear } from '@/shared/utils/movie';
import { useChatStore } from '@/stores/chat.store';

const QUICK_SUGGESTIONS = [
  'Gợi ý phim hành động kịch tính',
  'Phim nào nhiều comment nhất?',
  'Phim nào điểm đánh giá cao nhất?',
  'Tìm phim giống Người Nhện',
];

/** Component hiển thị câu trả lời AI với hiệu ứng gõ chữ mượt mà (Smooth Typing Buffer + SSE). */
function StreamingMarkdown({
  content,
  isStreaming,
  isStreamActive,
  onComplete,
  onTypingStep,
}: {
  content: string;
  isStreaming?: boolean;
  isStreamActive?: boolean;
  onComplete?: () => void;
  onTypingStep?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const shouldStream = Boolean(isStreaming) && !reduceMotion;
  const [displayedLength, setDisplayedLength] = useState(shouldStream ? 0 : content.length);

  useEffect(() => {
    if (!shouldStream) {
      return;
    }

    // Nếu đã gõ hết buffer hiện tại:
    if (displayedLength >= content.length) {
      // Chỉ kích hoạt onComplete khi luồng dữ liệu từ server đã kết thúc hoàn toàn (!isStreamActive).
      // Nếu server vẫn đang stream dữ liệu tiếp theo, giữ nguyên trạng thái chờ token mới.
      if (!isStreamActive) {
        onComplete?.();
      }
      return;
    }

    // Tốc độ gõ chữ mượt mà thích ứng (Adaptive Pacing)
    // Tự động điều chỉnh nhịp gõ theo lượng ký tự đang chờ trong buffer:
    // - Khi buffer dồn nhiều (LLM trả về nhanh): tăng nhẹ step để đuổi kịp tự nhiên, không lag đọng.
    // - Khi buffer ngắn: gõ nhẹ nhàng từng ký tự (1-2 chars mỗi 16-18ms).
    // - Tạm dừng nhẹ khi gặp dấu câu hoặc ngắt dòng để tạo cảm giác tự nhiên như người gõ.
    const remaining = content.length - displayedLength;
    const currentChar = content[displayedLength] || '';
    const isPause = /[.,!?\n]/.test(currentChar);

    let step = 1;
    let delay = 18;

    if (isPause) {
      step = 1;
      delay = 35;
    } else if (remaining > 60) {
      step = 3;
      delay = 12;
    } else if (remaining > 20) {
      step = 2;
      delay = 16;
    } else {
      step = 1;
      delay = 18;
    }

    const timer = setTimeout(() => {
      setDisplayedLength((prev) => Math.min(prev + step, content.length));
      onTypingStep?.();
    }, delay);

    return () => clearTimeout(timer);
  }, [content, displayedLength, shouldStream, isStreamActive, onComplete, onTypingStep]);

  const displayedContent = shouldStream ? content.slice(0, displayedLength) : content;
  const isTyping = shouldStream && (displayedLength < content.length || Boolean(isStreamActive));

  return (
    <div
      onClick={() => {
        if (isTyping) {
          // Bấm vào tin nhắn để hiển thị ngay toàn bộ nội dung hiện có trong buffer
          setDisplayedLength(content.length);
          if (!isStreamActive) {
            onComplete?.();
          }
        }
      }}
      className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4"
    >
      <ReactMarkdown>{displayedContent}</ReactMarkdown>
      {isTyping && (
        <span
          className="bg-primary ml-0.5 inline-block h-3.5 w-1.5 animate-pulse rounded-xs align-middle"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/** Thẻ phim thu gọn hiển thị bên dưới câu trả lời của trợ lý AI. */
function ChatMovieItem({ movie }: { movie: MovieWithSimilarScore }) {
  const title = getMovieTitle(movie);
  const year = getReleaseYear(movie.releaseDate);
  const poster = getPosterUrl(movie.posterPath || movie.backdropPath);
  const rating = typeof movie.voteAverage === 'number' ? movie.voteAverage : 0;

  return (
    <Link
      href={`/movies/${movie.id}`}
      aria-label={title}
      className="bg-background hover:bg-accent focus-visible:ring-ring flex items-center gap-2.5 rounded-md border p-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
    >
      <div className="bg-muted relative aspect-[2/3] w-10 shrink-0 overflow-hidden rounded-sm">
        {poster ? (
          <Image
            src={poster}
            alt={title}
            width={60}
            height={90}
            sizes="40px"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="text-muted-foreground flex h-full w-full items-center justify-center">
            <Film className="size-4" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-foreground line-clamp-1 text-xs font-semibold">{title}</p>
        <div className="text-muted-foreground mt-0.5 flex items-center gap-2 text-[11px]">
          {year && <span>{year}</span>}
          {rating > 0 && (
            <span className="inline-flex items-center gap-0.5 font-medium">
              <Star className="text-primary size-3 fill-current" aria-hidden="true" />
              {rating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

/** Khung chat trợ lý phim AI với 2 chế độ: popup góc dưới phải và phóng to ở trung tâm màn hình. */
export function ChatWidget() {
  const isOpen = useChatStore((state) => state.isOpen);
  const isExpanded = useChatStore((state) => state.isExpanded);
  const messages = useChatStore((state) => state.messages);
  const toggleChat = useChatStore((state) => state.toggleChat);
  const closeChat = useChatStore((state) => state.closeChat);
  const toggleExpand = useChatStore((state) => state.toggleExpand);
  const addMessage = useChatStore((state) => state.addMessage);
  const updateMessage = useChatStore((state) => state.updateMessage);
  const clearMessages = useChatStore((state) => state.clearMessages);

  const [inputValue, setInputValue] = useState('');
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);
  const [isStreamLoading, setIsStreamLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();

  const { mutateAsync: askChat, isPending } = useAskChat();
  const isGenerating = isPending || isStreamLoading;

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      if (typeof messagesEndRef.current.scrollIntoView === 'function') {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      }
    }
  }, [messages, isOpen, isGenerating, isExpanded]);

  useEffect(() => {
    if (!isExpanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        toggleExpand();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, toggleExpand]);

  const sendQuestion = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || isGenerating) return;

    setInputValue('');
    setLastFailedQuestion(null);

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    addMessage({
      role: 'user',
      content: question,
    });

    setIsStreamLoading(true);

    let assistantMsgId = '';
    let accumulatedText = '';
    let hasCreatedAssistantMessage = false;
    let capturedMovies: MovieWithSimilarScore[] = [];
    let capturedIntent: string | undefined;
    let capturedStatType: string | undefined;

    try {
      if (typeof chatApi.askStream === 'function') {
        await chatApi.askStream(
          { message: question, topK: 5 },
          {
            onMetadata: (metadata) => {
              capturedMovies = metadata.movies || [];
              capturedIntent = metadata.intent;
              capturedStatType = metadata.statType;

              if (hasCreatedAssistantMessage && assistantMsgId) {
                updateMessage(assistantMsgId, {
                  movies: capturedMovies,
                  intent: capturedIntent,
                  statType: capturedStatType,
                });
              }
            },
            onToken: (token) => {
              accumulatedText += token;
              if (!hasCreatedAssistantMessage) {
                hasCreatedAssistantMessage = true;
                assistantMsgId = `assistant-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
                setIsStreamLoading(false);
                addMessage({
                  id: assistantMsgId,
                  role: 'assistant',
                  content: accumulatedText,
                  movies: capturedMovies,
                  intent: capturedIntent,
                  statType: capturedStatType,
                  isStreaming: true,
                  isStreamActive: true,
                });
              } else {
                updateMessage(assistantMsgId, {
                  content: accumulatedText,
                });
              }
            },
            onDone: () => {
              setIsStreamLoading(false);
              if (hasCreatedAssistantMessage && assistantMsgId) {
                updateMessage(assistantMsgId, {
                  isStreamActive: false,
                });
              } else {
                addMessage({
                  role: 'assistant',
                  content:
                    'Tôi đã tìm kiếm phim theo yêu cầu nhưng không nhận được nội dung phản hồi.',
                  movies: capturedMovies,
                  intent: capturedIntent,
                  statType: capturedStatType,
                  isStreaming: true,
                  isStreamActive: false,
                });
              }
            },
            onError: (err) => {
              setIsStreamLoading(false);
              setLastFailedQuestion(question);
              if (!hasCreatedAssistantMessage) {
                addMessage({
                  role: 'assistant',
                  content:
                    err.message ||
                    'Không thể kết nối trợ lý AI, vui lòng thử lại sau.',
                  isError: true,
                  isStreaming: false,
                  isStreamActive: false,
                });
              } else {
                updateMessage(assistantMsgId, {
                  isError: true,
                  isStreaming: false,
                  isStreamActive: false,
                });
              }
            },
          },
          controller.signal,
        );
      } else {
        const result = await askChat({ message: question, topK: 5 });
        setIsStreamLoading(false);
        addMessage({
          role: 'assistant',
          content:
            result?.answer ||
            'Tôi đã tìm thấy một số bộ phim phù hợp với yêu cầu của bạn.',
          movies: result?.movies ?? [],
          intent: result?.intent,
          statType: result?.statType,
          isStreaming: true,
          isStreamActive: false,
        });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setIsStreamLoading(false);
      const { message } = parseAxiosError(error);
      setLastFailedQuestion(question);
      if (!hasCreatedAssistantMessage) {
        addMessage({
          role: 'assistant',
          content:
            message || 'Không thể kết nối trợ lý AI, vui lòng thử lại sau.',
          isError: true,
          isStreaming: false,
          isStreamActive: false,
        });
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await sendQuestion(inputValue);
  };

  const renderCard = (expanded: boolean) => (
    <Card
      className={cn(
        'border-border bg-card text-card-foreground flex flex-col gap-0 overflow-hidden rounded-lg border py-0 shadow-xl',
        expanded ? 'h-full w-full shadow-2xl' : 'h-[32rem] max-h-[calc(100vh-7rem)]',
      )}
    >
      <CardHeader className="bg-primary text-primary-foreground flex shrink-0 flex-row items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary-foreground/15 flex size-9 items-center justify-center rounded-full">
            <Bot className="size-5" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-sm font-bold">Trợ lý điện ảnh AI</CardTitle>
            <p className="text-primary-foreground/80 text-xs">Gợi ý & tìm phim thông minh</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clearMessages}
            disabled={isGenerating}
            aria-label="Xóa lịch sử trò chuyện"
            className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground size-11"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleExpand}
            aria-label={expanded ? 'Thu nhỏ về góc màn hình' : 'Phóng to ở giữa màn hình'}
            className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground size-11"
          >
            {expanded ? (
              <Minimize2 className="size-4" aria-hidden="true" />
            ) : (
              <Maximize2 className="size-4" aria-hidden="true" />
            )}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={closeChat}
            aria-label="Đóng khung chat"
            className="text-primary-foreground hover:bg-primary-foreground/15 hover:text-primary-foreground size-11"
          >
            <X className="size-5" aria-hidden="true" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={cn('flex items-start gap-2.5', isUser ? 'flex-row-reverse' : 'flex-row')}
            >
              <div
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border',
                  isUser
                    ? 'bg-primary text-primary-foreground border-transparent'
                    : 'bg-muted text-muted-foreground border-border',
                )}
              >
                {isUser ? (
                  <User className="size-4" aria-hidden="true" />
                ) : (
                  <Sparkles className="size-4" aria-hidden="true" />
                )}
              </div>

              <div
                className={cn(
                  'max-w-[85%] space-y-2 rounded-lg px-3.5 py-2.5 text-sm',
                  isUser
                    ? 'bg-primary text-primary-foreground'
                    : msg.isError
                      ? 'bg-destructive/10 text-destructive border-destructive/30 border'
                      : 'bg-muted text-foreground',
                )}
              >
                {isUser ? (
                  <div className="prose prose-sm dark:prose-invert max-w-none break-words [&_p]:my-1 [&_ul]:my-1 [&_ul]:pl-4">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : (
                  <StreamingMarkdown
                    content={msg.content}
                    isStreaming={msg.isStreaming}
                    isStreamActive={msg.isStreamActive}
                    onComplete={() => {
                      if (msg.isStreaming) {
                        updateMessage(msg.id, { isStreaming: false });
                      }
                    }}
                    onTypingStep={() => {
                      if (
                        messagesEndRef.current &&
                        typeof messagesEndRef.current.scrollIntoView === 'function'
                      ) {
                        messagesEndRef.current.scrollIntoView({
                          behavior: 'smooth',
                        });
                      }
                    }}
                  />
                )}

                {msg.isError && lastFailedQuestion && (
                  <div className="pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isGenerating}
                      onClick={() => sendQuestion(lastFailedQuestion)}
                      className="h-9 text-xs"
                    >
                      Thử lại
                    </Button>
                  </div>
                )}

                {msg.movies && msg.movies.length > 0 && !msg.isStreaming && (
                  <div className="border-border/60 space-y-1.5 border-t pt-2">
                    <p className="text-muted-foreground text-xs font-medium">
                      Phim liên quan từ hệ thống:
                    </p>
                    <div
                      className={cn(
                        'gap-2',
                        expanded ? 'grid grid-cols-1 sm:grid-cols-2' : 'space-y-1.5',
                      )}
                    >
                      {msg.movies.slice(0, 4).map((movie) => (
                        <ChatMovieItem key={movie.id} movie={movie} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {isGenerating && (
          <div className="flex items-start gap-2.5" aria-label="Đang tạo câu trả lời">
            <div className="bg-muted text-muted-foreground border-border flex size-8 shrink-0 items-center justify-center rounded-full border">
              <Sparkles className="size-4" aria-hidden="true" />
            </div>
            <div className="bg-muted w-60 space-y-2 rounded-lg p-3">
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-3/5" />
            </div>
          </div>
        )}

        {messages.length <= 1 && !isGenerating && (
          <div className="pt-2">
            <p className="text-muted-foreground mb-2 text-xs font-medium">Gợi ý câu hỏi nhanh:</p>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_SUGGESTIONS.map((suggestion) => (
                <Badge
                  key={suggestion}
                  variant="secondary"
                  asChild
                  className="cursor-pointer px-2.5 py-1.5 text-xs font-normal"
                >
                  <button
                    type="button"
                    onClick={() => sendQuestion(suggestion)}
                    className="focus-visible:ring-ring min-h-9 text-left focus-visible:ring-2 focus-visible:outline-none"
                  >
                    {suggestion}
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </CardContent>

      <CardFooter className="border-border bg-background shrink-0 border-t p-3">
        <form onSubmit={handleFormSubmit} className="flex w-full items-center gap-2">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Nhập câu hỏi tìm phim..."
            aria-label="Nhập câu hỏi cho trợ lý phim"
            disabled={isGenerating}
            maxLength={1000}
            className="h-11 flex-1 text-sm"
          />
          <Button
            type="submit"
            size="icon"
            disabled={isGenerating || !inputValue.trim()}
            aria-label="Gửi tin nhắn"
            className="size-11 shrink-0"
          >
            <Send className="size-4" aria-hidden="true" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );

  return (
    <>
      {/* Chế độ phóng to ở trung tâm màn hình */}
      <AnimatePresence>
        {isOpen && isExpanded && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Khung chat trợ lý phim AI phóng to"
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 backdrop-blur-xs sm:p-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                toggleExpand();
              }
            }}
          >
            <motion.div
              key="chat-modal-expanded"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: 16 }}
              transition={{
                duration: MOTION_DURATION_FAST,
                ease: MOTION_EASE,
              }}
              className="flex h-[85vh] max-h-[850px] w-full max-w-4xl flex-col"
            >
              {renderCard(true)}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Chế độ popup thu gọn ở góc dưới bên phải */}
      <div className="fixed right-4 bottom-4 z-40 flex flex-col items-end sm:right-6 sm:bottom-6">
        <AnimatePresence>
          {isOpen && !isExpanded && (
            <motion.div
              key="chat-popup"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.96 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.96 }}
              transition={{
                duration: MOTION_DURATION_FAST,
                ease: MOTION_EASE,
              }}
              className="mb-3 w-[calc(100vw-2rem)] max-w-md sm:w-96"
            >
              {renderCard(false)}
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          type="button"
          size="icon"
          onClick={toggleChat}
          aria-label={isOpen ? 'Đóng trợ lý phim AI' : 'Mở trợ lý phim AI'}
          aria-expanded={isOpen}
          className="size-14 rounded-full shadow-lg"
        >
          {isOpen ? (
            <X className="size-6" aria-hidden="true" />
          ) : (
            <MessageCircle className="size-6" aria-hidden="true" />
          )}
        </Button>
      </div>
    </>
  );
}

export default ChatWidget;
