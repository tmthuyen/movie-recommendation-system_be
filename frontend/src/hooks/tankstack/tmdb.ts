import { movieApi, type TmdbDiscoverParams, type TmdbImportPayload } from '@/apis/movie.api';
import { parseAxiosError } from '@/lib/axiosClient';
import type { Pagination } from '@/shared/types/api.types';
import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';

/** QueryKey phẳng theo rule frontend — không nhét object vào key. */
function discoverQueryKey(params: TmdbDiscoverParams): Array<string | number> {
  return [
    'tmdb-discover',
    params.mode ?? 'popularity',
    params.page ?? 1,
    params.limit ?? 20,
    params.releaseDateFrom ?? '',
    params.releaseDateTo ?? '',
    params.releaseYearFrom ?? '',
    params.releaseYearTo ?? '',
    (params.genreIds ?? []).join(','),
    params.originalLanguage ?? '',
  ];
}

export interface TmdbDiscoverResult {
  items: NonNullable<Awaited<ReturnType<typeof movieApi.discoverTmdb>>['result']>;
  pagination: Pagination;
}

/** Option thể loại TMDB cho dialog scanner. */
export function useTmdbGenreOptions(enabled = true) {
  return useQuery({
    queryKey: ['tmdb-options', 'genres'],
    queryFn: async () => (await movieApi.getTmdbGenres()).result ?? [],
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}

/** Option ngôn ngữ TMDB cho dialog scanner. */
export function useTmdbLanguageOptions(enabled = true) {
  return useQuery({
    queryKey: ['tmdb-options', 'languages'],
    queryFn: async () => (await movieApi.getTmdbLanguages()).result ?? [],
    enabled,
    staleTime: 1000 * 60 * 5,
  });
}

/** Discover candidate — chỉ chạy khi admin bấm “Tìm phim”. */
export function useTmdbDiscover(
  params: TmdbDiscoverParams | null,
): UseQueryResult<TmdbDiscoverResult> & { queryKey: Array<string | number> } {
  const queryKey = params ? discoverQueryKey(params) : ['tmdb-discover', 'idle'];

  const query = useQuery({
    queryKey,
    queryFn: async (): Promise<TmdbDiscoverResult> => {
      const response = await movieApi.discoverTmdb(params!);
      return {
        items: response.result ?? [],
        pagination: response.pagination ?? {
          total: 0,
          page: params?.page ?? 1,
          limit: params?.limit ?? 20,
          totalPages: 0,
        },
      };
    },
    enabled: params !== null,
    staleTime: 0,
    placeholderData: (previous) => previous,
  });

  return Object.assign(query, { queryKey });
}

/** Import candidate đã chọn; toast + invalidate danh sách phim admin. */
export function useTmdbImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: TmdbImportPayload) => movieApi.importTmdb(input),
    onSuccess: (response) => {
      const count = response.result?.length ?? 0;
      toast.success(
        count > 0 ? `Đã thêm ${count} phim từ TMDB.` : 'Không có phim mới nào được thêm.',
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-movies'] });
      void queryClient.invalidateQueries({ queryKey: ['tmdb-discover'] });
    },
    onError: (error) => {
      toast.error(parseAxiosError(error).message || 'Không thể thêm phim từ TMDB.');
    },
  });
}
