'use client';

import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
}

export interface MultiSelectFieldProps {
  id: string;
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
}

/**
 * Multi-select nhẹ (Popover + listbox) — thay cho `<select multiple>`:
 * mỗi option là button ≥44px, có trạng thái `aria-selected`, chip đã chọn
 * hiển thị bên dưới kèm nút bỏ chọn.
 */
export function MultiSelectField({
  id,
  options,
  value,
  onChange,
  placeholder = 'Chọn…',
  disabled = false,
  invalid = false,
}: MultiSelectFieldProps) {
  const [open, setOpen] = useState(false);

  const toggle = (optionValue: string) => {
    onChange(
      value.includes(optionValue)
        ? value.filter((item) => item !== optionValue)
        : [...value, optionValue],
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-listbox`}
            aria-invalid={invalid}
            disabled={disabled}
            className="h-11 w-full cursor-pointer justify-between font-normal"
          >
            <span className={cn('truncate', value.length === 0 && 'text-muted-foreground')}>
              {value.length === 0 ? placeholder : `Đã chọn ${value.length}`}
            </span>
            <ChevronsUpDown className="size-4 opacity-60" aria-hidden />
          </Button>
        </PopoverTrigger>

        <PopoverContent align="start" className="w-[min(92vw,20rem)] p-1">
          <ul
            id={`${id}-listbox`}
            role="listbox"
            aria-multiselectable="true"
            aria-label={placeholder}
            className="max-h-64 overflow-y-auto"
          >
            {options.length === 0 ? (
              <li className="text-muted-foreground px-2 py-3 text-sm">Không có lựa chọn</li>
            ) : (
              options.map((option) => {
                const selected = value.includes(option.value);
                return (
                  <li key={option.value} role="option" aria-selected={selected}>
                    <button
                      type="button"
                      onClick={() => toggle(option.value)}
                      className="hover:bg-foreground/5 focus-visible:ring-ring flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
                    >
                      <span
                        className={cn(
                          'border-input flex size-4 shrink-0 items-center justify-center rounded-[4px] border',
                          selected && 'border-primary bg-primary text-primary-foreground',
                        )}
                        aria-hidden
                      >
                        {selected ? <Check className="size-3" /> : null}
                      </span>
                      <span className="truncate">{option.label}</span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </PopoverContent>
      </Popover>

      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((item) => {
            const label = options.find((option) => option.value === item)?.label ?? item;
            return (
              <span
                key={item}
                className="border-border/70 bg-secondary text-secondary-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
              >
                <span className="max-w-40 truncate">{label}</span>
                <button
                  type="button"
                  onClick={() => toggle(item)}
                  className="hover:bg-foreground/10 focus-visible:ring-ring inline-flex size-5 cursor-pointer items-center justify-center rounded-full transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  aria-label={`Bỏ chọn ${label}`}
                >
                  <X className="size-3" aria-hidden />
                </button>
              </span>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
