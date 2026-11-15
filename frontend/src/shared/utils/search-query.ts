/**
 * Tiện ích dựng query tìm kiếm/lọc/sort cho các API admin dùng `BaseSearchRequest`.
 *
 * Hợp đồng backend (xem `docs/BACKEND.md`):
 * - `filters` lặp lại, mỗi giá trị `field:operator:value`.
 * - `sort` lặp lại, mỗi giá trị `field:DIR[,field2:DIR2]`.
 *
 * Lưu ý: axios mặc định serialize mảng thành `filters[]=`, backend không đọc.
 * Vì vậy khi gọi API phải dùng `qs.stringify(params, { arrayFormat: 'repeat' })`.
 */

/** Toán tử lọc backend hỗ trợ (`BaseSearchRequest`). */
export type FilterOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'in'
  | 'notin'
  | 'isnull'
  | 'isnotnull'
  | 'empty'
  | 'notempty'
  | 'between';

/** Kiểu dữ liệu của field — quyết định control nhập và validate phía UI. */
export type FilterFieldType = 'text' | 'number' | 'date' | 'enum' | 'boolean';

export interface FilterOption {
  value: string;
  label: string;
}

/** Cấu hình một field cho phép lọc (mỗi trang tự khai báo). */
export interface FilterFieldConfig {
  field: string;
  label: string;
  type: FilterFieldType;
  operators: FilterOperator[];
  /** Chỉ dùng cho `type: 'enum'`. */
  options?: FilterOption[];
  placeholder?: string;
}

/** Một điều kiện lọc đang được áp dụng (state phía client). */
export interface ActiveFilter {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
}

/** Field cho phép sort — phải khớp whitelist của backend. */
export interface SortFieldConfig {
  field: string;
  label: string;
}

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  eq: 'bằng',
  ne: 'khác',
  gt: 'lớn hơn',
  gte: 'lớn hơn hoặc bằng',
  lt: 'nhỏ hơn',
  lte: 'nhỏ hơn hoặc bằng',
  contains: 'chứa',
  startsWith: 'bắt đầu bằng',
  endsWith: 'kết thúc bằng',
  in: 'thuộc danh sách',
  notin: 'không thuộc danh sách',
  isnull: 'trống',
  isnotnull: 'có giá trị',
  empty: 'rỗng (null/chuỗi rỗng)',
  notempty: 'không rỗng',
  between: 'trong khoảng',
};

/** `isnull`/`isnotnull`/`empty`/`notempty` không cần value. */
export function isValueOptional(operator: FilterOperator): boolean {
  return (
    operator === 'isnull' ||
    operator === 'isnotnull' ||
    operator === 'empty' ||
    operator === 'notempty'
  );
}

let filterSequence = 0;

/** ID tạm cho một điều kiện lọc (chỉ dùng làm React key). */
export function createFilterId(): string {
  filterSequence += 1;
  return `filter-${Date.now().toString(36)}-${filterSequence}`;
}

/** Dựng một giá trị `filters` gửi backend. */
export function buildFilterString(filter: ActiveFilter): string {
  if (isValueOptional(filter.operator)) {
    return `${filter.field}:${filter.operator}`;
  }
  return `${filter.field}:${filter.operator}:${filter.value.trim()}`;
}

/** Dựng giá trị `sort` gửi backend từ state sort của TanStack Table. */
export function buildSortString(
  sorting: ReadonlyArray<{ id: string; desc: boolean }>,
): string | undefined {
  if (sorting.length === 0) return undefined;
  return sorting.map((item) => `${item.id}:${item.desc ? 'DESC' : 'ASC'}`).join(',');
}

/** Validate một điều kiện lọc theo cấu hình field. Trả về message lỗi hoặc `null`. */
export function validateFilterValue(
  filter: ActiveFilter,
  field?: FilterFieldConfig,
): string | null {
  if (isValueOptional(filter.operator)) return null;

  const value = filter.value.trim();
  if (!value) return 'Vui lòng nhập giá trị';

  const isNumeric = field?.type === 'number';

  if (filter.operator === 'between') {
    const parts = value.split('_').map((part) => part.trim());
    if (parts.length !== 2 || parts.some((part) => !part)) {
      return 'Khoảng phải có dạng "từ_đến"';
    }
    if (isNumeric && parts.some((part) => !Number.isFinite(Number(part)))) {
      return 'Khoảng phải là hai số';
    }
    if (isNumeric && Number(parts[0]) > Number(parts[1])) {
      return 'Giá trị bắt đầu phải nhỏ hơn hoặc bằng giá trị kết thúc';
    }
    if (field?.type === 'date' && parts[0] > parts[1]) {
      return 'Ngày bắt đầu phải trước ngày kết thúc';
    }
    return null;
  }

  if (filter.operator === 'in' || filter.operator === 'notin') {
    const parts = value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length === 0) return 'Vui lòng nhập ít nhất một giá trị';
    if (isNumeric && parts.some((part) => !Number.isFinite(Number(part)))) {
      return 'Danh sách phải là các số, cách nhau bởi dấu phẩy';
    }
    return null;
  }

  if (isNumeric && !Number.isFinite(Number(value))) {
    return 'Giá trị phải là số';
  }

  return null;
}

/** Nhãn hiển thị của một điều kiện (dùng cho chip). */
export function describeFilter(filter: ActiveFilter, fields: FilterFieldConfig[]): string {
  const field = fields.find((item) => item.field === filter.field);
  const label = field?.label ?? filter.field;
  const operatorLabel = OPERATOR_LABELS[filter.operator] ?? filter.operator;

  if (isValueOptional(filter.operator)) {
    return `${label} ${operatorLabel}`;
  }

  let value = filter.value.trim();

  if (filter.operator === 'between') {
    value = value.replace('_', ' → ');
  } else if (field?.type === 'enum') {
    value = value
      .split(',')
      .map((item) => {
        const trimmed = item.trim();
        return field.options?.find((option) => option.value === trimmed)?.label ?? trimmed;
      })
      .join(', ');
  }

  return `${label} ${operatorLabel} ${value}`;
}
