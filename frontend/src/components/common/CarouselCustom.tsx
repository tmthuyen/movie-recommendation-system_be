'use client';

import { Children, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface HorizontalScrollerProps {
  children: ReactNode;
  className?: string;
  gap?: number;
}

export function HorizontalScroller({ children, className, gap = 12 }: HorizontalScrollerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScroll, setCanScroll] = useState({
    left: false,
    right: false,
  });

  const updateScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    setCanScroll({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const observer = new ResizeObserver(updateScroll);
    observer.observe(el);

    if (el.firstElementChild) {
      observer.observe(el.firstElementChild);
    }

    el.addEventListener('scroll', updateScroll, {
      passive: true,
    });

    updateScroll();

    return () => {
      observer.disconnect();
      el.removeEventListener('scroll', updateScroll);
    };
  }, [updateScroll]);

  const scroll = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;

    el.scrollBy({
      left: direction * el.clientWidth * 0.7,
      behavior: 'smooth',
    });
  };

  return (
    <div className={cn('relative flex min-w-0 items-center', className)}>
      {canScroll.left && (
        <Button
          type="button"
          onClick={() => scroll(-1)}
          aria-label="Cuộn trái"
          variant="outline"
          className="bg-background z-10 flex size-9 shrink-0 items-center justify-center rounded-full"
        >
          <ChevronLeft className="size-5" />
        </Button>
      )}

      <div ref={scrollRef} className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
        <div className="flex w-max min-w-full items-center" style={{ gap }}>
          {Children.map(children, (child) => (
            <div className="w-max shrink-0 cursor-pointer">{child}</div>
          ))}
        </div>
      </div>

      {canScroll.right && (
        <Button
          type="button"
          onClick={() => scroll(1)}
          aria-label="Cuộn phải"
          variant="outline"
          className="z-10 flex size-9 shrink-0 items-center justify-center rounded-full"
        >
          <ChevronRight className="size-5" />
        </Button>
      )}
    </div>
  );
}
