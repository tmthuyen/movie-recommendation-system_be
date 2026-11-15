'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { describeFilter } from '@/shared/utils/search-query';
import type { ActiveFilterChipsProps } from './types';

/** Chip hiển thị các điều kiện đang áp dụng; bấm chip để xóa nhanh. */
export function ActiveFilterChips({ fields, value, onRemove, onClear }: ActiveFilterChipsProps) {
  if (value.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      role="group"
      aria-label="Bộ lọc đang áp dụng"
    >
      {value.map((filter) => {
        const label = describeFilter(filter, fields);
        return (
          <button
            key={filter.id}
            type="button"
            onClick={() => onRemove(filter.id)}
            className="border-border/70 bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-ring inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none sm:min-h-8"
            aria-label={`Xóa bộ lọc ${label}`}
          >
            <span>{label}</span>
            <X className="size-3.5 opacity-70" aria-hidden />
          </button>
        );
      })}

      <Button type="button" variant="ghost" size="sm" className="h-9 text-xs" onClick={onClear}>
        Xóa tất cả
      </Button>
    </div>
  );
}
