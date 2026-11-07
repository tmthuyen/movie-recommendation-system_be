'use client';

import type { ReactNode } from 'react';
import { MotionReveal } from '@/components/motion/motion-primitives';
import { cn } from '@/lib/utils';

interface ColumnListProps<T> {
  items: T[];
  getKey: (item: T) => string | number;
  renderItem: (item: T) => ReactNode;
  /** Hiển thị khi `items` rỗng. */
  emptyState?: ReactNode;
  className?: string;
  itemClassName?: string;
}

/**
 * Danh sách dạng cột dùng chung. Mỗi item tự reveal khi vào viewport
 * (amount nhỏ) để list dài không phải chờ cả khối lộ diện mới animate.
 */
export function ColumnList<T>({
  items,
  getKey,
  renderItem,
  emptyState,
  className,
  itemClassName,
}: ColumnListProps<T>) {
  if (items.length === 0) return <>{emptyState ?? null}</>;

  return (
    <div role="list" className={cn('flex flex-col gap-3', className)}>
      {items.map((item, index) => (
        <MotionReveal
          key={getKey(item)}
          index={index % 6}
          when="in-view"
          viewportAmount={0.05}
          role="listitem"
          className={itemClassName}
        >
          {renderItem(item)}
        </MotionReveal>
      ))}
    </div>
  );
}
