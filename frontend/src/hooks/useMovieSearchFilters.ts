'use client';

import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  buildMovieSearchQuery,
  DEFAULT_MOVIE_FILTERS,
  MovieSearchFilters,
  parseMovieSearchFilters,
  toMovieApiQuery,
} from '@/shared/utils/movie-search-query';

export type MovieSearchPatch = Partial<MovieSearchFilters> & {
  /** `true` (mặc định) → đổi filter thì về trang 1. */
  resetPage?: boolean;
};

export function useMovieSearchFilters() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const searchKey = searchParams.toString();
  const filters = useMemo(() => parseMovieSearchFilters(searchKey), [searchKey]);
  const latestKeyRef = useRef(searchKey);
  const filtersRef = useRef(filters);

  useLayoutEffect(() => {
    latestKeyRef.current = searchKey;
    filtersRef.current = filters;
  }, [searchKey, filters]);

  const replaceWith = useCallback(
    (next: MovieSearchFilters) => {
      const nextQs = buildMovieSearchQuery(next);
      if (nextQs === latestKeyRef.current) return;
      router.replace(nextQs ? `${pathname}?${nextQs}` : pathname, { scroll: false });
    },
    [pathname, router],
  );

  const updateFilters = useCallback(
    (patch: MovieSearchPatch) => {
      const current = filtersRef.current;
      const { resetPage = true, ...values } = patch;
      const next: MovieSearchFilters = {
        ...current,
        ...values,
        page: values.page ?? (resetPage ? 1 : current.page),
      };
      replaceWith(next);
    },
    [replaceWith],
  );

  const resetFilters = useCallback(() => {
    replaceWith(DEFAULT_MOVIE_FILTERS);
  }, [replaceWith]);

  const apiParams = useMemo(() => toMovieApiQuery(filters), [filters]);

  return { filters, apiParams, updateFilters, resetFilters, searchKey };
}
