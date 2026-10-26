import { interactionApi } from '@/apis/interaction.api';
import { parseAxiosError } from '@/lib/axiosClient';
import { ApiPaginatedResponse, Pagination } from '@/shared/types/api.types';
import { Interaction, InteractionStats, InteractionType } from '@/shared/types/interaction.types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';

const FAVORITES_KEY = 'interactions';

/** Query key thống kê tương tác của một phim. */
export const interactionStatsQueryKey = (movieId: number | string) => [
  FAVORITES_KEY,
  'stats',
  String(movieId),
];

/** Kết quả phân trang của `my-history`/`my-favorites` (items + pagination từ envelope). */
export interface PagedInteractions {
  items: Interaction[];
  pagination: Pagination;
}

/** Key query chung cho danh sách yêu thích của user hiện tại. */
export const myFavoritesQueryKey = (limit: number) => [FAVORITES_KEY, 'my-favorites', limit];

/**
 * Danh sách tương tác yêu thích (like) của user hiện tại —
 * `GET /api/interactions/my-favorites` (JWT). Chỉ fetch khi đã đăng nhập.
 */
export function useMyFavorites(limit: number = 100) {
  const { isAuthenticated } = useAuthStore();

  return useQuery({
    queryKey: myFavoritesQueryKey(limit),
    queryFn: async (): Promise<Interaction[]> => {
      const response = await interactionApi.getMyFavorites({ page: 1, limit });
      return response.result;
    },
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5, // 5 phút
    gcTime: 1000 * 60 * 10, // 10 phút
  });
}

/**
 * Hook nội bộ cho danh sách tương tác **có phân trang** (trang `/my-history`,
 * `/my-favorites`). Dùng queryKey root RIÊNG (`my-history`, `my-favorites-page`)
 * — tách khỏi root `interactions` để optimistic update (dạng `Interaction[]`
 * trong `useToggleInteraction`) không ghi đè nhầm cache có shape `{items, pagination}`.
 */
function usePagedInteractionsQuery(
  source: 'my-history' | 'my-favorites-page',
  page: number,
  limit: number,
  fetcher: (params: {
    page: number;
    limit: number;
  }) => Promise<ApiPaginatedResponse<Interaction[]>>,
  enabled: boolean
) {
  return useQuery({
    queryKey: [source, page, limit],
    queryFn: async (): Promise<PagedInteractions> => {
      const response = await fetcher({ page, limit });
      return { items: response.result ?? [], pagination: response.pagination };
    },
    enabled,
    staleTime: 1000 * 60 * 2, // 2 phút
    gcTime: 1000 * 60 * 10, // 10 phút
  });
}

/**
 * Lịch sử xem phim (JWT) — `GET /api/interactions/my-history` (chỉ `type=click`,
 * join `movie`). Chỉ fetch khi `enabled` + đã đăng nhập.
 */
export function useMyHistory(page: number = 1, limit: number = 12, enabled: boolean = true) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return usePagedInteractionsQuery(
    'my-history',
    page,
    limit,
    interactionApi.getMyHistory,
    enabled && isAuthenticated
  );
}

/**
 * Danh sách yêu thích **có phân trang** (JWT) — `GET /api/interactions/my-favorites`
 * (`type = like`, join `movie`). Khác `useMyFavorites` (trả mảng page-1, limit
 * lớn — dùng cho trạng thái nút trên card).
 */
export function useMyFavoritesPaged(page: number = 1, limit: number = 12, enabled: boolean = true) {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  return usePagedInteractionsQuery(
    'my-favorites-page',
    page,
    limit,
    interactionApi.getMyFavorites,
    enabled && isAuthenticated
  );
}

/**
 * Set các key `"${movieId}:${type}"` mà user đã tương tác (dùng để render
 * trạng thái active của nút trên card).
 */
export function useMyFavoriteKeys(limit: number = 100) {
  const { data, isLoading } = useMyFavorites(limit);

  const keys = useMemo(() => {
    const set = new Set<string>();
    (data ?? []).forEach((item) => {
      const movieId = item.movie?.id ?? item.movieId;
      if (movieId !== undefined && movieId !== null) {
        set.add(`${movieId}:${item.type}`);
      }
    });
    return set;
  }, [data]);

  return { keys, isLoading };
}

/**
 * Thống kê tương tác realtime của phim — `GET /api/interactions/stats/:movieId`.
 * Dùng ở trang chi tiết để hiển thị số like ban đầu (sau đó cập nhật qua WS).
 */
export function useInteractionStats(movieId: number | string, enabled: boolean = true) {
  return useQuery({
    queryKey: interactionStatsQueryKey(movieId),
    queryFn: async (): Promise<InteractionStats> => {
      const response = await interactionApi.getStats(movieId);
      return response.result;
    },
    enabled: enabled && Boolean(movieId),
    staleTime: 1000 * 30,
  });
}

/**
 * TOGGLE yêu thích (`POST /api/interactions`) — optimistic update lên cache
 * `my-favorites`, rollback `onError`, đồng bộ lại với server `onSettled`.
 */
export function useToggleInteraction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      movieId: number | string;
      type: 'like';
    }): Promise<{
      action: 'added' | 'removed';
      type: InteractionType;
      score: number;
      likeCount: number;
    }> => {
      const response = await interactionApi.toggle(input);
      return {
        action: response.result.action,
        type: response.result.type,
        score: response.result.score,
        likeCount: response.result.likeCount,
      };
    },
    onMutate: async ({ movieId, type }) => {
      // Chỉ optimistic trên cache danh sách yêu thích (không đụng cache stats).
      const favoritesKey = [FAVORITES_KEY, 'my-favorites'];
      await queryClient.cancelQueries({ queryKey: favoritesKey });
      const previous = queryClient.getQueriesData<Interaction[]>({
        queryKey: favoritesKey,
      });

      // Optimistic: đổi trạng thái local (chưa biết added/removed nên đảo trạng thái hiện có)
      queryClient.setQueriesData<Interaction[]>({ queryKey: favoritesKey }, (old) => {
        if (!old) return old;
        const exists = old.some(
          (item) => `${item.movie?.id ?? item.movieId}:${item.type}` === `${movieId}:${type}`
        );
        if (exists) {
          return old.filter(
            (item) => `${item.movie?.id ?? item.movieId}:${item.type}` !== `${movieId}:${type}`
          );
        }
        return [...old, { id: -Date.now(), score: 5, type, movieId } as Interaction];
      });

      return { previous };
    },
    onError: (error, _variables, context) => {
      // Rollback cache
      context?.previous?.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
      });
      const parsedError = parseAxiosError(error);
      toast.error(parsedError.message || 'Không thể cập nhật tương tác.');
    },
    onSuccess: (result) => {
      toast.success(result.action === 'added' ? 'Đã thêm vào yêu thích.' : 'Đã bỏ yêu thích.');
    },
    onSettled: (_data, _error, variables) => {
      // Đồng bộ lại với server (đọc result.action bên server làm nguồn sự thật)
      queryClient.invalidateQueries({ queryKey: [FAVORITES_KEY] });
      // Danh sách trang Lịch sử xem / Yêu thích (queryKey root riêng, có phân trang)
      queryClient.invalidateQueries({ queryKey: ['my-history'] });
      queryClient.invalidateQueries({ queryKey: ['my-favorites-page'] });
      if (variables?.movieId) {
        queryClient.invalidateQueries({
          queryKey: interactionStatsQueryKey(variables.movieId),
        });
      }
    },
  });
}

const useInteraction = {
  useMyFavorites,
  useMyFavoriteKeys,
  useMyHistory,
  useMyFavoritesPaged,
  useToggleInteraction,
  useInteractionStats,
};

export default useInteraction;
