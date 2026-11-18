'use client';

import { Layers, Search, Sparkles, type LucideIcon } from 'lucide-react';
import type { RecommendationSearchMode } from '@/hooks/tankstack/useRecommendation';
import { cn } from '@/lib/utils';

interface SearchModeOption {
  value: RecommendationSearchMode;
  label: string;
  description: string;
  icon: LucideIcon;
}

const SEARCH_MODE_OPTIONS: SearchModeOption[] = [
  {
    value: 'semantic',
    label: 'Ngữ nghĩa',
    description: 'Tìm theo ý nghĩa mô tả, không cần đúng tên phim.',
    icon: Sparkles,
  },
  {
    value: 'rerank',
    label: 'Kết hợp + rerank',
    description: 'Kết hợp BM25 và ngữ nghĩa, xếp hạng lại bằng RRF.',
    icon: Layers,
  },
  {
    value: 'lexical',
    label: 'Từ khóa',
    description: 'Khớp từ khóa chính xác trong dữ liệu phim.',
    icon: Search,
  },
];

interface SearchModeSelectorProps {
  value: RecommendationSearchMode;
  onChange: (mode: RecommendationSearchMode) => void;
  className?: string;
}

/** Nút chọn chế độ tìm kiếm. */
export function SearchModeSelector({ value, onChange, className }: SearchModeSelectorProps) {
  const active =
    SEARCH_MODE_OPTIONS.find((option) => option.value === value) ?? SEARCH_MODE_OPTIONS[0];

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="group"
        aria-label="Chế độ tìm kiếm"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {SEARCH_MODE_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isActive = option.value === value;

          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(option.value)}
              className={cn(
                'focus-visible:ring-ring inline-flex h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {option.label}
            </button>
          );
        })}
      </div>
      <p className="text-muted-foreground text-xs">{active.description}</p>
    </div>
  );
}
