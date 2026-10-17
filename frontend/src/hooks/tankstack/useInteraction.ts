import { interactionApi } from '@/apis/interaction.api';
import { parseAxiosError } from '@/lib/axiosClient';
import { Interaction, InteractionType } from '@/shared/types/interaction.types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';

const FAVORITES_KEY = 'interactions';

/** Key query chung cho danh sách yêu thích của user hiện tại. */
export const myFavoritesQueryKey = (limit: number) => [FAVORITES_KEY, 'my-favorites', limit];

/**
 * Danh sách tương tác yêu thích (like/favorite/watchlist) của user hiện tại —
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
 * TOGGLE tương tác (`POST /api/interactions`) — optimistic update lên cache
 * `my-favorites`, rollback `onError`, đồng bộ lại với server `onSettled`.
 */
export function useToggleInteraction() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      movieId: number | string;
      type: InteractionType;
    }): Promise<{ action: 'added' | 'removed'; type: InteractionType }> => {
      const response = await interactionApi.toggle(input);
      return { action: response.result.action, type: response.result.type };
    },
    onMutate: async ({ movieId, type }) => {
      await queryClient.cancelQueries({ queryKey: [FAVORITES_KEY] });
      const previous = queryClient.getQueriesData<{ data: Interaction[] }[]>({
        queryKey: [FAVORITES_KEY],
      });

      // Optimistic: đổi trạng thái local (chưa biết added/removed nên đảo trạng thái hiện có)
      queryClient.setQueriesData<Interaction[]>({ queryKey: [FAVORITES_KEY] }, (old) => {
        if (!old) return old;
        const exists = old.some(
          (item) => `${item.movie?.id ?? item.movieId}:${item.type}` === `${movieId}:${type}`
        );
        if (exists) {
          return old.filter(
            (item) => `${item.movie?.id ?? item.movieId}:${item.type}` !== `${movieId}:${type}`
          );
        }
        return [...old, { id: -Date.now(), score: 0, type, movieId } as Interaction];
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
      toast.success(
        result.action === 'added'
          ? 'Đã thêm vào danh sách của bạn.'
          : 'Đã xóa khỏi danh sách của bạn.'
      );
    },
    onSettled: () => {
      // Đồng bộ lại với server (đọc result.action bên server làm nguồn sự thật)
      queryClient.invalidateQueries({ queryKey: [FAVORITES_KEY] });
    },
  });
}

const useInteraction = {
  useMyFavorites,
  useMyFavoriteKeys,
  useToggleInteraction,
};

export default useInteraction;
