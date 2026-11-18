'use client';

import { Search, Sparkles } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { EmptyState } from '@/components/common/EmptyState';
import { MovieInfiniteGrid } from '@/components/movie/movie-infinite-grid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  searchInfiniteQueryKey,
  useSearchMoviesInfinite,
  type RecommendationSearchMode,
} from '@/hooks/tankstack/useRecommendation';
import { parseAxiosError } from '@/lib/axiosClient';
import type { Movie } from '@/shared/types/movie.types';
import { SearchModeSelector } from './search-mode-selector';

const PAGE_SIZE = 12;
const MODES: RecommendationSearchMode[] = ['semantic', 'rerank', 'lexical'];
const DEFAULT_MODE: RecommendationSearchMode = 'semantic';

const SUGGESTIONS = [
  'phim hành động gay cấn',
  'tình cảm lãng mạn',
  'khoa học viễn tưởng',
  'hoạt hình cho trẻ em',
];

function parseMode(value: string | null): RecommendationSearchMode {
  return MODES.includes(value as RecommendationSearchMode)
    ? (value as RecommendationSearchMode)
    : DEFAULT_MODE;
}

export function SearchClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const expiredHandledRef = useRef(false);

  const keyword = (searchParams.get('q') ?? '').trim();
  const mode = parseMode(searchParams.get('mode'));
  const [draftState, setDraftState] = useState<{ value: string; forKeyword: string }>({
    value: keyword,
    forKeyword: keyword,
  });
  // Từ khóa hiển thị trong ô tìm kiếm; đồng bộ theo URL khi keyword đổi.
  const draft = draftState.forKeyword === keyword ? draftState.value : keyword;
  const setDraft = (value: string) => setDraftState({ value, forKeyword: keyword });

  const {
    data,
    isLoading,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
    refetch,
  } = useSearchMoviesInfinite({ mode, keyword, limit: PAGE_SIZE });

  const movies = useMemo<Movie[]>(() => {
    const seen = new Set<Movie['id']>();
    return (data?.pages ?? [])
      .flatMap((page) => page.result ?? [])
      .filter((movie) => {
        if (seen.has(movie.id)) return false;
        seen.add(movie.id);
        return true;
      });
  }, [data]);

  const total = data?.pages[0]?.pagination.total ?? movies.length;
  const parsedError = useMemo(() => (error ? parseAxiosError(error) : null), [error]);

  useEffect(() => {
    if (!parsedError) {
      expiredHandledRef.current = false;
      return;
    }
    if (expiredHandledRef.current || parsedError.statusCode !== 409) return;

    expiredHandledRef.current = true;
    toast.info('Kết quả tìm kiếm đã thay đổi, đang tải lại từ đầu.');
    void queryClient.resetQueries({
      queryKey: searchInfiniteQueryKey(mode, keyword, PAGE_SIZE),
    });
  }, [parsedError, mode, keyword, queryClient]);

  const navigate = (nextKeyword: string, nextMode: RecommendationSearchMode, replace = false) => {
    const params = new URLSearchParams(searchParams.toString());
    const trimmed = nextKeyword.trim();

    if (trimmed) params.set('q', trimmed);
    else params.delete('q');
    params.set('mode', nextMode);

    const url = `${pathname}?${params.toString()}`;
    if (replace) router.replace(url, { scroll: false });
    else router.push(url);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(draft, mode);
  };

  const applySuggestion = (suggestion: string) => {
    setDraft(suggestion);
    navigate(suggestion, mode);
  };

  const lexicalUnavailable = mode === 'lexical' && parsedError?.statusCode === 404;

  const errorTitle = lexicalUnavailable ? 'Chế độ từ khóa chưa khả dụng' : undefined;
  const errorMessage = parsedError
    ? lexicalUnavailable
      ? 'Backend chưa bổ sung endpoint tìm kiếm từ khóa. Vui lòng chọn chế độ khác hoặc thử lại sau.'
      : parsedError.message
    : undefined;

  return (
    <div className="space-y-5">
      <form role="search" aria-label="Tìm kiếm phim" onSubmit={handleSubmit} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Mô tả phim bạn muốn xem…"
            aria-label="Từ khóa tìm kiếm"
            maxLength={200}
            className="h-11 rounded-full pl-9"
          />
        </div>
        <Button type="submit" className="h-11 shrink-0 cursor-pointer rounded-full px-5">
          Tìm
        </Button>
      </form>

      <SearchModeSelector value={mode} onChange={(nextMode) => navigate(keyword, nextMode, true)} />

      {!keyword ? (
        <EmptyState
          icon={Sparkles}
          title="Tìm phim theo cách bạn muốn"
          description="Nhập mô tả hoặc chọn một gợi ý bên dưới, sau đó chọn chế độ tìm kiếm."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  type="button"
                  variant="outline"
                  className="h-11 cursor-pointer rounded-full"
                  onClick={() => applySuggestion(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          }
        />
      ) : (
        <>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {isLoading ? 'Đang tìm…' : `${total} kết quả cho “${keyword}”`}
          </p>

          <MovieInfiniteGrid
            movies={movies}
            isLoading={isLoading}
            isError={isError}
            errorTitle={errorTitle}
            errorMessage={errorMessage}
            hasNextPage={Boolean(hasNextPage)}
            isFetchingNextPage={isFetchingNextPage}
            isFetchNextPageError={isFetchNextPageError}
            fetchNextPage={() => void fetchNextPage()}
            onRetry={() => void refetch()}
            onRetryNextPage={() => void fetchNextPage()}
            emptyState={
              <EmptyState
                icon={Search}
                title="Không tìm thấy phim phù hợp"
                description="Thử mô tả khác hoặc đổi chế độ tìm kiếm."
              />
            }
            endText="Bạn đã xem hết kết quả tìm kiếm."
          />
        </>
      )}
    </div>
  );
}
