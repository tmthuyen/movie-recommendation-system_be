'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';

interface MovieYearRangeProps {
  from?: number;
  to?: number;
  onChange: (range: { releaseYearFrom?: number; releaseYearTo?: number }) => void;
  /** `inline` = một hàng gọn (thanh lọc desktop), `stack` = dọc (drawer mobile). */
  layout?: 'inline' | 'stack';
}

const CURRENT_YEAR = new Date().getFullYear();
export const MIN_RELEASE_YEAR = 1990;
export const MAX_RELEASE_YEAR = CURRENT_YEAR + 1;

const YEAR_OPTIONS = Array.from(
  { length: MAX_RELEASE_YEAR - MIN_RELEASE_YEAR + 1 },
  (_, index) => MAX_RELEASE_YEAR - index,
);

function clampYear(value: number): number {
  return Math.min(MAX_RELEASE_YEAR, Math.max(MIN_RELEASE_YEAR, value));
}

/** Chuẩn hoá props (có thể undefined) thành cặp [from, to] hợp lệ, luôn from ≤ to. */
export function toYearDraft(from?: number, to?: number): [number, number] {
  const start = from !== undefined ? clampYear(from) : MIN_RELEASE_YEAR;
  const end = to !== undefined ? clampYear(to) : MAX_RELEASE_YEAR;
  return start <= end ? [start, end] : [end, start];
}

/** Bỏ param khi chạm biên để URL gọn (biên = "không lọc"). */
export function toYearRange([from, to]: [number, number]): {
  releaseYearFrom?: number;
  releaseYearTo?: number;
} {
  return {
    releaseYearFrom: from > MIN_RELEASE_YEAR ? from : undefined,
    releaseYearTo: to < MAX_RELEASE_YEAR ? to : undefined,
  };
}

export function describeYearRange([from, to]: [number, number]): string {
  if (from === MIN_RELEASE_YEAR && to === MAX_RELEASE_YEAR) return 'Tất cả các năm';
  if (from === to) return String(from);
  if (from === MIN_RELEASE_YEAR) return `Đến ${to}`;
  if (to === MAX_RELEASE_YEAR) return `Từ ${from}`;
  return `${from} – ${to}`;
}

export function MovieYearRange({ from, to, onChange, layout = 'inline' }: MovieYearRangeProps) {
  const [draft, setDraft] = useState<[number, number]>(() => toYearDraft(from, to));

  // URL là nguồn sự thật: back/forward hoặc chip xoá lọc phải đẩy lại slider.
  useEffect(() => {
    const next = toYearDraft(from, to);
    setDraft((prev) => (prev[0] === next[0] && prev[1] === next[1] ? prev : next));
  }, [from, to]);

  const rangeText = useMemo(() => describeYearRange(draft), [draft]);

  function commit(next: [number, number]) {
    const normalized: [number, number] = [Math.min(next[0], next[1]), Math.max(next[0], next[1])];
    setDraft(normalized);
    onChange(toYearRange(normalized));
  }

  function handleSliderChange(values: number[]) {
    if (values.length < 2) return;
    setDraft([Math.min(values[0], values[1]), Math.max(values[0], values[1])]);
  }

  function handleSelectFrom(value: string) {
    const nextFrom = value === 'all' ? MIN_RELEASE_YEAR : clampYear(Number(value));
    commit([nextFrom, Math.max(nextFrom, draft[1])]);
  }

  function handleSelectTo(value: string) {
    const nextTo = value === 'all' ? MAX_RELEASE_YEAR : clampYear(Number(value));
    commit([Math.min(draft[0], nextTo), nextTo]);
  }

  const triggerClassName =
    layout === 'stack'
      ? 'data-[size=default]:h-11 w-full'
      : 'data-[size=default]:h-11 w-[112px] shrink-0';

  const fromSelect = (
    <Select
      value={draft[0] === MIN_RELEASE_YEAR ? 'all' : String(draft[0])}
      onValueChange={handleSelectFrom}
    >
      <SelectTrigger className={triggerClassName} aria-label="Năm phát hành từ">
        <SelectValue placeholder="Từ năm" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tất cả</SelectItem>
        {YEAR_OPTIONS.map((year) => (
          <SelectItem key={`from-${year}`} value={String(year)}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const toSelect = (
    <Select
      value={draft[1] === MAX_RELEASE_YEAR ? 'all' : String(draft[1])}
      onValueChange={handleSelectTo}
    >
      <SelectTrigger className={triggerClassName} aria-label="Năm phát hành đến">
        <SelectValue placeholder="Đến năm" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">Tất cả</SelectItem>
        {YEAR_OPTIONS.map((year) => (
          <SelectItem key={`to-${year}`} value={String(year)}>
            {year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const slider = (
    <Slider
      min={MIN_RELEASE_YEAR}
      max={MAX_RELEASE_YEAR}
      step={1}
      value={draft}
      onValueChange={handleSliderChange}
      onValueCommit={(values) => {
        if (values.length < 2) return;
        commit([values[0], values[1]]);
      }}
      thumbLabels={[String(draft[0]), String(draft[1])]}
      thumbAriaLabels={['Năm phát hành từ', 'Năm phát hành đến']}
      className="min-w-0 flex-1"
    />
  );

  if (layout === 'stack') {
    return (
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted-foreground text-xs">Khoảng năm</span>
          <span className="text-xs font-medium tabular-nums">{rangeText}</span>
        </div>
        {slider}
        <div className="grid grid-cols-2 gap-2">
          {fromSelect}
          {toSelect}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {fromSelect}
      {slider}
      {toSelect}
      <span className="text-muted-foreground hidden w-[104px] shrink-0 text-right text-xs font-medium tabular-nums lg:inline">
        {rangeText}
      </span>
    </div>
  );
}
