'use client';

import { useMemo } from 'react';
import {
  InputMultiSelect,
  InputMultiSelectTrigger,
} from '@/components/extend-ui/input-multiselect';
import type { SelectOption } from '@/shared/types/ui.types';
import { cn } from '@/lib/utils';

export interface FilterOption {
  value: number;
  label: string;
}

interface MovieMultiSelectProps {
  options: FilterOption[];
  selected: number[];
  onChange: (next: number[]) => void;
  placeholder: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel: string;
  className?: string;
  loading?: boolean;
  /** Số badge hiển thị trên trigger trước khi rút gọn thành "+N". */
  truncateCount?: number;
  /** Toolbar: giữ trigger trên 1 hàng, badge dài tự truncate thay vì xuống dòng. */
  singleLine?: boolean;
}

/**
 * Multi-select thể loại / quốc gia cho bộ lọc phim.
 *
 * Dùng lại `InputMultiSelect` + `InputMultiSelectTrigger` (cùng kiểu với
 * `UserProfileForm`) để đồng nhất UI: trigger hiển thị badge, dropdown có
 * "Chọn tất cả" / "Xóa" / "Đóng" và ô tìm kiếm.
 */
export function MovieMultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  searchPlaceholder = 'Tìm...',
  emptyText = 'Không có lựa chọn.',
  ariaLabel,
  className,
  loading,
  truncateCount = 2,
  singleLine = false,
}: MovieMultiSelectProps) {
  const selectOptions = useMemo<SelectOption[]>(
    () => options.map((option) => ({ value: String(option.value), label: option.label })),
    [options],
  );

  // Chỉ tạo array mới khi nội dung selected thay đổi để tránh effect đồng bộ
  // bên trong InputMultiSelect chạy lại mỗi render.
  const selectedValues = useMemo(() => selected.map(String), [selected]);

  const handleValueChange = (next: string[]) => {
    const ids = next.map(Number).filter((value) => Number.isInteger(value) && value > 0);
    onChange(ids);
  };

  const accessibleLabel =
    selected.length > 0 ? `${ariaLabel}, đã chọn ${selected.length}` : ariaLabel;

  return (
    <InputMultiSelect
      options={selectOptions}
      value={selectedValues}
      onValueChange={handleValueChange}
      placeholder={loading ? 'Đang tải...' : placeholder}
      truncateCount={truncateCount}
      disabled={loading}
      emptyText={emptyText}
      className="w-[min(320px,calc(100vw-2rem))]"
      displayTextProps={{
        placeholder,
        selectAll: 'Chọn tất cả',
        clear: 'Xóa',
        close: 'Đóng',
        search: searchPlaceholder,
        empty: emptyText,
      }}
    >
      {(provided) => (
        <InputMultiSelectTrigger
          {...provided}
          singleLine={singleLine}
          aria-label={accessibleLabel}
          title={ariaLabel}
          className={cn(singleLine && 'h-11', className)}
        />
      )}
    </InputMultiSelect>
  );
}
