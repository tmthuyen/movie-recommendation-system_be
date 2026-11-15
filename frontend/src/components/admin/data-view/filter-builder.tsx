'use client';

import { Check, Filter, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  createFilterId,
  isValueOptional,
  OPERATOR_LABELS,
  validateFilterValue,
  type ActiveFilter,
  type FilterFieldConfig,
  type FilterOperator,
} from '@/shared/utils/search-query';
import type { FilterBuilderProps } from './types';

/** Popover dựng nhiều điều kiện lọc (AND) rồi áp dụng một lần. */
export function FilterBuilder({ fields, value, onChange, disabled }: FilterBuilderProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ActiveFilter[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  const openPopover = (next: boolean) => {
    if (next) {
      setDraft(value.map((filter) => ({ ...filter })));
      setShowErrors(false);
    }
    setOpen(next);
  };

  const errors = useMemo(
    () =>
      draft.map((filter) =>
        validateFilterValue(
          filter,
          fields.find((field) => field.field === filter.field),
        ),
      ),
    [draft, fields],
  );

  const addCondition = () => {
    const field = fields[0];
    if (!field) return;
    setDraft((prev) => [
      ...prev,
      { id: createFilterId(), field: field.field, operator: field.operators[0], value: '' },
    ]);
  };

  const updateDraft = (id: string, patch: Partial<ActiveFilter>) => {
    setDraft((prev) => prev.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter)));
  };

  const apply = () => {
    setShowErrors(true);
    if (errors.some(Boolean)) return;
    onChange(draft);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={openPopover}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-11 gap-2" disabled={disabled}>
          <Filter className="size-4" aria-hidden />
          Bộ lọc
          {value.length > 0 ? (
            <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 rounded-full px-1.5 text-xs">
              {value.length}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[min(94vw,680px)] p-0">
        <div className="flex flex-col gap-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Bộ lọc nâng cao</p>
              <p className="text-muted-foreground text-xs">
                Các điều kiện được kết hợp với nhau (AND).
              </p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-9" onClick={addCondition}>
              <Plus className="size-4" aria-hidden />
              Thêm
            </Button>
          </div>

          <div className="flex max-h-[45vh] flex-col gap-3 overflow-y-auto pr-1">
            {draft.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                Chưa có điều kiện nào.
              </p>
            ) : null}

            {draft.map((filter, index) => (
              <FilterConditionRow
                key={filter.id}
                filter={filter}
                fields={fields}
                error={showErrors ? errors[index] : null}
                onChange={(patch) => updateDraft(filter.id, patch)}
                onRemove={() => setDraft((prev) => prev.filter((item) => item.id !== filter.id))}
              />
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 border-t pt-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-10"
              onClick={() => setDraft([])}
              disabled={draft.length === 0}
            >
              Xóa tất cả
            </Button>
            <Button type="button" className="h-11 px-5" onClick={apply}>
              Áp dụng
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface FilterConditionRowProps {
  filter: ActiveFilter;
  fields: FilterFieldConfig[];
  error?: string | null;
  onChange: (patch: Partial<ActiveFilter>) => void;
  onRemove: () => void;
}

function FilterConditionRow({
  filter,
  fields,
  error,
  onChange,
  onRemove,
}: FilterConditionRowProps) {
  const field = fields.find((item) => item.field === filter.field);
  const operators = field?.operators ?? [];

  const handleFieldChange = (fieldName: string) => {
    const nextField = fields.find((item) => item.field === fieldName);
    onChange({
      field: fieldName,
      operator: nextField?.operators[0] ?? filter.operator,
      value: '',
    });
  };

  return (
    <div className="bg-muted/40 flex flex-col gap-2 rounded-xl p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto]">
        <Select value={filter.field} onValueChange={handleFieldChange}>
          <SelectTrigger className="h-11" aria-label="Trường lọc">
            <SelectValue placeholder="Trường" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((item) => (
              <SelectItem key={item.field} value={item.field}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filter.operator}
          onValueChange={(operator) =>
            onChange({ operator: operator as FilterOperator, value: '' })
          }
        >
          <SelectTrigger className="h-11" aria-label="Toán tử lọc">
            <SelectValue placeholder="Toán tử" />
          </SelectTrigger>
          <SelectContent>
            {operators.map((operator) => (
              <SelectItem key={operator} value={operator}>
                {OPERATOR_LABELS[operator]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <FilterValueControl filter={filter} field={field} onChange={onChange} />

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive size-11 justify-self-start sm:justify-self-auto"
          onClick={onRemove}
          aria-label="Xóa điều kiện"
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

interface FilterValueControlProps {
  filter: ActiveFilter;
  field?: FilterFieldConfig;
  onChange: (patch: Partial<ActiveFilter>) => void;
}

function FilterValueControl({ filter, field, onChange }: FilterValueControlProps) {
  if (isValueOptional(filter.operator)) {
    return (
      <p className="text-muted-foreground flex h-11 items-center px-1 text-sm">Không cần giá trị</p>
    );
  }

  const inputType = field?.type === 'number' ? 'number' : field?.type === 'date' ? 'date' : 'text';

  if (filter.operator === 'between') {
    const [from = '', to = ''] = filter.value.split('_');
    return (
      <div className="flex items-center gap-2">
        <Input
          type={inputType}
          value={from}
          onChange={(event) => onChange({ value: `${event.target.value}_${to}` })}
          placeholder="Từ"
          className="h-11"
          aria-label="Giá trị bắt đầu"
        />
        <span className="text-muted-foreground" aria-hidden>
          –
        </span>
        <Input
          type={inputType}
          value={to}
          onChange={(event) => onChange({ value: `${from}_${event.target.value}` })}
          placeholder="Đến"
          className="h-11"
          aria-label="Giá trị kết thúc"
        />
      </div>
    );
  }

  if (
    field?.type === 'enum' &&
    field.options?.length &&
    (filter.operator === 'in' || filter.operator === 'notin')
  ) {
    return <EnumMultiValueControl filter={filter} field={field} onChange={onChange} />;
  }

  if (
    field?.type === 'enum' &&
    field.options?.length &&
    (filter.operator === 'eq' || filter.operator === 'ne')
  ) {
    return (
      <Select value={filter.value} onValueChange={(value) => onChange({ value })}>
        <SelectTrigger className="h-11" aria-label="Giá trị lọc">
          <SelectValue placeholder="Chọn giá trị" />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  const placeholder =
    filter.operator === 'in' || filter.operator === 'notin' ? 'a, b, c' : 'Giá trị';

  return (
    <Input
      type={inputType}
      value={filter.value}
      onChange={(event) => onChange({ value: event.target.value })}
      placeholder={placeholder}
      className="h-11"
      aria-label="Giá trị lọc"
    />
  );
}

interface EnumMultiValueControlProps {
  filter: ActiveFilter;
  field: FilterFieldConfig;
  onChange: (patch: Partial<ActiveFilter>) => void;
}

/**
 * Chọn nhiều giá trị enum (quan hệ: thể loại, quốc gia, phim, vai trò).
 * Danh sách inline (không lồng Popover trong Popover), có ô tìm kiếm và
 * option cao ≥44px; giá trị vẫn gửi backend dạng id nối bằng dấu phẩy.
 */
function EnumMultiValueControl({ filter, field, onChange }: EnumMultiValueControlProps) {
  const [query, setQuery] = useState('');
  const selected = filter.value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const options = field.options;
  const filtered = useMemo(() => {
    const list = options ?? [];
    const keyword = query.trim().toLowerCase();
    if (!keyword) return list;
    return list.filter((option) => option.label.toLowerCase().includes(keyword));
  }, [options, query]);

  const toggle = (value: string) => {
    const next = selected.includes(value)
      ? selected.filter((item) => item !== value)
      : [...selected, value];
    onChange({ value: next.join(',') });
  };

  return (
    <div className="flex flex-col gap-2">
      <Input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Tìm giá trị…"
        className="h-11"
        aria-label={`Tìm ${field.label}`}
      />
      <div
        role="listbox"
        aria-multiselectable="true"
        aria-label={field.label}
        className="max-h-40 overflow-y-auto rounded-lg border p-1"
      >
        {filtered.length === 0 ? (
          <p className="text-muted-foreground px-2 py-2 text-sm">Không có lựa chọn</p>
        ) : (
          filtered.map((option) => {
            const isSelected = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggle(option.value)}
                className="hover:bg-foreground/5 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left text-sm"
              >
                <span
                  className={`flex size-4 shrink-0 items-center justify-center rounded-[4px] border ${
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input'
                  }`}
                  aria-hidden
                >
                  {isSelected ? <Check className="size-3" /> : null}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })
        )}
      </div>
      <p className="text-muted-foreground text-xs">
        {selected.length > 0 ? `Đã chọn ${selected.length}` : 'Chưa chọn giá trị nào'}
      </p>
    </div>
  );
}
