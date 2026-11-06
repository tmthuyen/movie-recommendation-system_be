'use client';

import { Check } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import useCountry from '@/hooks/tankstack/useCountry';
import * as useGenreHook from '@/hooks/tankstack/useGenre';
import { useMovieSearchFilters } from '@/hooks/useMovieSearchFilters';
import {
  buildMovieSearchQuery,
  countActiveMovieFilters,
  DEFAULT_MOVIE_FILTERS,
  MovieSearchFilters,
} from '@/shared/utils/movie-search-query';
import { MovieSearchInput } from './filters/MovieSearchInput';
import { MovieFilterPanel, SORT_OPTIONS } from './filters/MovieFilterPanel';
import { MovieFilterDrawer } from './filters/MovieFilterDrawer';
import { buildActiveFilterChips, MovieActiveFilters } from './filters/MovieActiveFilters';
import { FilterOption } from './filters/MovieMultiSelect';

function sortLabel(sort: string): string {
  return SORT_OPTIONS.find((o) => o.value === sort)?.label ?? 'Mới nhất (năm phát hành)';
}

export function MovieFilters() {
  const { filters, updateFilters } = useMovieSearchFilters();
  const { data: genres, isLoading: genresLoading } = useGenreHook.useGetAll(
    { page: 1, limit: 500 },
    1000 * 60 * 30,
  );
  const { data: countries, isLoading: countriesLoading } = useCountry.useGetCountries(
    1000 * 60 * 30,
  );

  const genreOptions = useMemo<FilterOption[]>(
    () =>
      (Array.isArray(genres) ? genres : []).map((g: { id: number; name: string }) => ({
        value: Number(g.id),
        label: g.name,
      })),
    [genres],
  );
  const countryOptions = useMemo<FilterOption[]>(
    () =>
      (Array.isArray(countries) ? countries : []).map(
        (c: { id: number; viName?: string; enName?: string; code?: string }) => ({
          value: Number(c.id),
          label: c.viName || c.enName || c.code || `Quốc gia #${c.id}`,
        }),
      ),
    [countries],
  );

  /**
   * `draft` = bộ lọc người dùng đang chọn, CHƯA áp dụng.
   * Mọi control chỉ sửa draft → không ghi URL, không gọi API.
   * Bấm "Áp dụng" mới ghi URL (1 lần) → React Query fetch 1 lần.
   */
  const [draft, setDraft] = useState<MovieSearchFilters>(filters);

  // URL là nguồn sự thật khi thay đổi từ bên ngoài: back/forward, xoá chip, đổi trang.
  useEffect(() => {
    setDraft(filters);
  }, [filters]);

  const patchDraft = useCallback((patch: Partial<MovieSearchFilters>) => {
    setDraft((prev) => ({ ...prev, ...patch, page: 1 }));
  }, []);

  const resetDraft = useCallback(() => {
    setDraft((prev) => ({ ...DEFAULT_MOVIE_FILTERS, limit: prev.limit }));
  }, []);

  const isDirty = useMemo(
    () => buildMovieSearchQuery(draft) !== buildMovieSearchQuery(filters),
    [draft, filters],
  );

  const applyDraft = useCallback(() => {
    if (!isDirty) return;
    updateFilters({ ...draft, page: 1 });
  }, [draft, isDirty, updateFilters]);

  const draftActiveCount = countActiveMovieFilters(draft);
  const loadingOptions = genresLoading || countriesLoading;

  const chips = useMemo(
    () =>
      buildActiveFilterChips({
        keyword: draft.keyword,
        genreIds: draft.genreIds,
        countryIds: draft.countryIds,
        genreOptions,
        countryOptions,
        sort: draft.sort,
        releaseYearFrom: draft.releaseYearFrom,
        releaseYearTo: draft.releaseYearTo,
        sortLabel,
        onChange: (patch) => patchDraft(patch as Partial<MovieSearchFilters>),
        onReset: resetDraft,
      }),
    [draft, genreOptions, countryOptions, patchDraft, resetDraft],
  );

  const searchInput = (className: string) => (
    <MovieSearchInput
      value={draft.keyword}
      onChange={(keyword) => patchDraft({ keyword })}
      onCommit={applyDraft}
      className={className}
    />
  );

  return (
    <div className="space-y-3">
      <div className="hidden lg:block">
        <MovieFilterPanel
          filters={draft}
          genreOptions={genreOptions}
          countryOptions={countryOptions}
          loadingOptions={loadingOptions}
          onChange={patchDraft}
          leading={searchInput('w-full min-w-0')}
          trailing={
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-11"
                onClick={resetDraft}
                disabled={draftActiveCount === 0}
              >
                Đặt lại
              </Button>
              <Button type="button" className="h-11" onClick={applyDraft} disabled={!isDirty}>
                Áp dụng
              </Button>
            </div>
          }
        />
      </div>

      <div className="flex items-center gap-2 lg:hidden">
        {searchInput('min-w-0 flex-1')}
        <Button
          type="button"
          size="icon"
          className="h-11 w-11 shrink-0"
          onClick={applyDraft}
          disabled={!isDirty}
          aria-label="Áp dụng bộ lọc"
          title="Áp dụng bộ lọc"
        >
          <Check className="size-4" aria-hidden="true" />
        </Button>
        <MovieFilterDrawer
          filters={draft}
          genreOptions={genreOptions}
          countryOptions={countryOptions}
          loadingOptions={loadingOptions}
          activeCount={draftActiveCount}
          onChange={patchDraft}
          onApply={applyDraft}
          onReset={resetDraft}
        />
      </div>

      <MovieActiveFilters chips={chips} onReset={resetDraft} />
    </div>
  );
}
