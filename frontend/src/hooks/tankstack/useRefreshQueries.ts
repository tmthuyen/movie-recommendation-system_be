import { useCallback, useMemo } from 'react';
import { useIsFetching, useQueryClient } from '@tanstack/react-query';

export type QueryRoot = readonly string[];

/** Invalidate đúng các queryKey root của trang và theo dõi trạng thái fetch của chúng. */
export function useRefreshQueries(queryRoots: readonly QueryRoot[]) {
  const queryClient = useQueryClient();
  const signature = JSON.stringify(queryRoots);
  const roots = useMemo(() => JSON.parse(signature) as string[][], [signature]);

  const count = useIsFetching({
    predicate: (query) =>
      roots.some((root) => root.every((part, index) => query.queryKey[index] === part)),
  });

  const refresh = useCallback(() => {
    roots.forEach((root) => {
      void queryClient.invalidateQueries({ queryKey: root });
    });
  }, [queryClient, roots]);

  return { refresh, isFetching: count > 0 };
}
