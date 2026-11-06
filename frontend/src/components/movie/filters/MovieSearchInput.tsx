'use client';

import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface MovieSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Gọi khi người dùng nhấn Enter (áp dụng bộ lọc). */
  onCommit?: () => void;
  placeholder?: string;
  className?: string;
}

/**
 * Ô tìm kiếm controlled: chỉ cập nhật draft ở parent, KHÔNG tự gọi API.
 * Enter = áp dụng (tương đương bấm nút "Áp dụng").
 */
export function MovieSearchInput({
  value,
  onChange,
  onCommit,
  placeholder = 'Tìm kiếm phim...',
  className,
}: MovieSearchInputProps) {
  return (
    <div className={cn('relative', className)}>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
        aria-hidden="true"
      />
      <Input
        type="search"
        aria-label="Tìm kiếm phim theo tên"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            onCommit?.();
          }
        }}
        className="h-11 pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          aria-label="Xoá từ khoá"
          onClick={() => onChange('')}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute top-1/2 right-1 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
