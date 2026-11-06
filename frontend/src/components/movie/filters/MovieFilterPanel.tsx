'use client';

import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { MovieSearchFilters, MovieSortOption } from '@/shared/utils/movie-search-query';
import { MovieMultiSelect, FilterOption } from './MovieMultiSelect';
import { MovieYearRange } from './MovieYearRange';

const SORT_OPTIONS: { value: MovieSortOption; label: string }[] = [
  { value: 'releaseDate:DESC', label: 'Mới nhất (năm phát hành)' },
  { value: 'viewCount:DESC', label: 'Phổ biến (lượt xem)' },
  { value: 'voteAverage:DESC', label: 'Đánh giá cao' },
  { value: 'likeCount:DESC', label: 'Nhiều lượt thích' },
];

interface MovieFilterPanelProps {
  filters: MovieSearchFilters;
  genreOptions: FilterOption[];
  countryOptions: FilterOption[];
  loadingOptions?: boolean;
  onChange: (patch: Partial<MovieSearchFilters>) => void;
  /** `inline` = thanh lọc desktop (grid 1 hàng + hàng năm), `stack` = drawer mobile. */
  layout?: 'inline' | 'stack';
  /** Chỉ layout inline: chèn đầu hàng (ô tìm kiếm). */
  leading?: ReactNode;
  /** Chỉ layout inline: chèn cuối hàng (nút Đặt lại / Áp dụng). */
  trailing?: ReactNode;
}

export function MovieFilterPanel({
  filters,
  genreOptions,
  countryOptions,
  loadingOptions,
  onChange,
  layout = 'inline',
  leading,
  trailing,
}: MovieFilterPanelProps) {
  if (layout === 'stack') {
    return (
      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label className="text-sm">Thể loại</Label>
          <MovieMultiSelect
            options={genreOptions}
            selected={filters.genreIds}
            onChange={(genreIds) => onChange({ genreIds })}
            placeholder="Thể loại"
            searchPlaceholder="Tìm thể loại..."
            emptyText="Không tìm thấy thể loại."
            ariaLabel="Lọc theo thể loại"
            loading={loadingOptions}
            truncateCount={3}
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-sm">Quốc gia</Label>
          <MovieMultiSelect
            options={countryOptions}
            selected={filters.countryIds}
            onChange={(countryIds) => onChange({ countryIds })}
            placeholder="Quốc gia"
            searchPlaceholder="Tìm quốc gia..."
            emptyText="Không tìm thấy quốc gia."
            ariaLabel="Lọc theo quốc gia"
            loading={loadingOptions}
            truncateCount={3}
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-sm">Năm phát hành</Label>
          <MovieYearRange
            from={filters.releaseYearFrom}
            to={filters.releaseYearTo}
            onChange={onChange}
            layout="stack"
          />
        </div>

        <div className="grid gap-1.5">
          <Label className="text-sm">Sắp xếp</Label>
          <Select
            value={filters.sort}
            onValueChange={(value) => onChange({ sort: value as MovieSortOption })}
          >
            <SelectTrigger aria-label="Sắp xếp phim" className="w-full data-[size=default]:h-11">
              <SelectValue placeholder="Sắp xếp" />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_180px_180px_190px_auto] items-center gap-2">
      {leading}

      <MovieMultiSelect
        options={genreOptions}
        selected={filters.genreIds}
        onChange={(genreIds) => onChange({ genreIds })}
        placeholder="Thể loại"
        searchPlaceholder="Tìm thể loại..."
        emptyText="Không tìm thấy thể loại."
        ariaLabel="Lọc theo thể loại"
        loading={loadingOptions}
        truncateCount={1}
        singleLine
        className="w-full min-w-0"
      />

      <MovieMultiSelect
        options={countryOptions}
        selected={filters.countryIds}
        onChange={(countryIds) => onChange({ countryIds })}
        placeholder="Quốc gia"
        searchPlaceholder="Tìm quốc gia..."
        emptyText="Không tìm thấy quốc gia."
        ariaLabel="Lọc theo quốc gia"
        loading={loadingOptions}
        truncateCount={1}
        singleLine
        className="w-full min-w-0"
      />

      <Select
        value={filters.sort}
        onValueChange={(value) => onChange({ sort: value as MovieSortOption })}
      >
        <SelectTrigger
          aria-label="Sắp xếp phim"
          className="w-full min-w-0 data-[size=default]:h-11"
        >
          <SelectValue placeholder="Sắp xếp" />
        </SelectTrigger>
        <SelectContent>
          {SORT_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {trailing}

      <div className="col-span-full">
        <MovieYearRange
          from={filters.releaseYearFrom}
          to={filters.releaseYearTo}
          onChange={onChange}
          layout="inline"
        />
      </div>
    </div>
  );
}

export { SORT_OPTIONS };
