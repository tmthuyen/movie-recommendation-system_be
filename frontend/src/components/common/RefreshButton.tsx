'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface RefreshButtonProps {
  /** Hàm invalidate queryKey của trang. */
  onRefresh: () => void;
  isFetching: boolean;
  label?: string;
  ariaLabel?: string;
  className?: string;
}

/** Nút làm mới dùng chung: vô hiệu hoá khi đang fetch, có spinner và nhãn cho trình đọc màn hình. */
export function RefreshButton({
  onRefresh,
  isFetching,
  label = 'Làm mới',
  ariaLabel = 'Làm mới dữ liệu',
  className,
}: RefreshButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn('h-11 cursor-pointer gap-2', className)}
      onClick={() => onRefresh()}
      disabled={isFetching}
      aria-label={ariaLabel}
      aria-busy={isFetching}
    >
      <RefreshCw
        className={cn('size-4', isFetching && 'animate-spin motion-reduce:animate-none')}
        aria-hidden="true"
      />
      {label}
    </Button>
  );
}
