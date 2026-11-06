'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { MovieSearchFilters } from '@/shared/utils/movie-search-query';
import { FilterOption } from './MovieMultiSelect';
import { MovieFilterPanel } from './MovieFilterPanel';

interface MovieFilterDrawerProps {
  filters: MovieSearchFilters;
  genreOptions: FilterOption[];
  countryOptions: FilterOption[];
  loadingOptions?: boolean;
  activeCount: number;
  onChange: (patch: Partial<MovieSearchFilters>) => void;
  /** Áp dụng bộ lọc đang chọn (ghi URL → gọi API 1 lần). */
  onApply: () => void;
  onReset: () => void;
}

export function MovieFilterDrawer({
  filters,
  genreOptions,
  countryOptions,
  loadingOptions,
  activeCount,
  onChange,
  onApply,
  onReset,
}: MovieFilterDrawerProps) {
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="h-11 gap-2 lg:hidden">
          <SlidersHorizontal className="size-4" aria-hidden="true" />
          Bộ lọc
          {activeCount > 0 ? (
            <Badge variant="secondary" className="ml-0.5 min-w-5 px-1.5">
              {activeCount}
            </Badge>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-0">
        <SheetHeader className="text-left">
          <SheetTitle>Bộ lọc phim</SheetTitle>
          <SheetDescription>Chọn điều kiện để lọc danh sách phim.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-2">
          <MovieFilterPanel
            filters={filters}
            genreOptions={genreOptions}
            countryOptions={countryOptions}
            loadingOptions={loadingOptions}
            onChange={onChange}
            layout="stack"
          />
        </div>
        <SheetFooter className="flex-row gap-2 border-t pt-4">
          <Button type="button" variant="outline" className="h-11 flex-1" onClick={onReset}>
            Đặt lại
          </Button>
          <SheetClose asChild>
            <Button type="button" className="h-11 flex-1" onClick={onApply}>
              Xem kết quả
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
