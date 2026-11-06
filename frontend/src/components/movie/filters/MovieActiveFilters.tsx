'use client';

import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterOption } from './MovieMultiSelect';

export interface ActiveFilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

interface MovieActiveFiltersProps {
  chips: ActiveFilterChip[];
  onReset: () => void;
}

export function MovieActiveFilters({ chips, onReset }: MovieActiveFiltersProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge key={chip.key} variant="secondary" className="h-8 gap-1 pr-1 pl-2">
          <span className="max-w-[180px] truncate">{chip.label}</span>
          <button
            type="button"
            aria-label={`Bỏ lọc ${chip.label}`}
            onClick={chip.onRemove}
            className="focus-visible:ring-ring inline-flex size-6 items-center justify-center rounded-full hover:bg-black/10 focus-visible:ring-2 focus-visible:outline-none dark:hover:bg-white/10"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={onReset} className="h-8">
        Xoá tất cả
      </Button>
    </div>
  );
}

export function buildActiveFilterChips(args: {
  keyword: string;
  genreIds: number[];
  countryIds: number[];
  genreOptions: FilterOption[];
  countryOptions: FilterOption[];
  sort: string;
  releaseYearFrom?: number;
  releaseYearTo?: number;
  sortLabel: (sort: string) => string;
  onChange: (patch: Record<string, unknown>) => void;
  onReset: () => void;
}): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  if (args.keyword) {
    chips.push({
      key: 'keyword',
      label: `Từ khoá: ${args.keyword}`,
      onRemove: () => args.onChange({ keyword: '' }),
    });
  }
  for (const id of args.genreIds) {
    const label = args.genreOptions.find((o) => o.value === id)?.label ?? `Thể loại #${id}`;
    chips.push({
      key: `genre-${id}`,
      label,
      onRemove: () => args.onChange({ genreIds: args.genreIds.filter((v) => v !== id) }),
    });
  }
  for (const id of args.countryIds) {
    const label = args.countryOptions.find((o) => o.value === id)?.label ?? `Quốc gia #${id}`;
    chips.push({
      key: `country-${id}`,
      label,
      onRemove: () => args.onChange({ countryIds: args.countryIds.filter((v) => v !== id) }),
    });
  }
  if (args.releaseYearFrom !== undefined || args.releaseYearTo !== undefined) {
    const from = args.releaseYearFrom ?? '...';
    const to = args.releaseYearTo ?? '...';
    chips.push({
      key: 'year',
      label: `Năm: ${from}–${to}`,
      onRemove: () => args.onChange({ releaseYearFrom: undefined, releaseYearTo: undefined }),
    });
  }
  if (args.sort !== 'releaseDate:DESC') {
    chips.push({
      key: 'sort',
      label: `Sắp xếp: ${args.sortLabel(args.sort)}`,
      onRemove: () => args.onChange({ sort: 'releaseDate:DESC' }),
    });
  }
  return chips;
}
