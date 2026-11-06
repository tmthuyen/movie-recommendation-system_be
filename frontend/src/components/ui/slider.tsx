'use client';

import * as React from 'react';
import { cn } from 'cn';
import { Slider as SliderPrimitive } from 'radix-ui';

type SliderProps = React.ComponentProps<typeof SliderPrimitive.Root> & {
  /** Nhãn hiển thị nổi trên từng thumb (ví dụ: giá trị đang kéo). */
  thumbLabels?: (React.ReactNode | undefined)[];
  /** aria-label riêng cho từng thumb (mặc định Radix: "Minimum"/"Maximum"). */
  thumbAriaLabels?: string[];
};

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  thumbLabels,
  thumbAriaLabels,
  ...props
}: SliderProps) {
  const _values = React.useMemo(
    () => (Array.isArray(value) ? value : Array.isArray(defaultValue) ? defaultValue : [min, max]),
    [value, defaultValue, min, max],
  );

  return (
    <SliderPrimitive.Root
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      className={cn(
        'relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col',
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track
        data-slot="slider-track"
        className={cn(
          'bg-muted relative grow overflow-hidden rounded-full data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5',
        )}
      >
        <SliderPrimitive.Range
          data-slot="slider-range"
          className={cn(
            'bg-primary absolute data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full',
          )}
        />
      </SliderPrimitive.Track>
      {Array.from({ length: _values.length }, (_, index) => {
        const label = thumbLabels?.[index];
        return (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            aria-label={thumbAriaLabels?.[index]}
            className="border-primary ring-ring/50 relative block size-4 shrink-0 rounded-full border bg-white shadow-sm transition-[color,box-shadow] after:absolute after:-inset-3.5 after:rounded-full after:content-[''] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"
          >
            {label != null ? (
              <span className="bg-popover text-popover-foreground border-border pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 rounded-md border px-1.5 py-0.5 text-[11px] font-medium tabular-nums shadow-sm">
                {label}
              </span>
            ) : null}
          </SliderPrimitive.Thumb>
        );
      })}
    </SliderPrimitive.Root>
  );
}

export { Slider };
