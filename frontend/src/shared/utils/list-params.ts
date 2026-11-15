import qs from 'qs';

/**
 * Query params cho các endpoint admin dùng `BaseSearchRequest`.
 *
 * Hợp đồng backend (xem `docs/BACKEND.md`):
 * - `filters` lặp lại, mỗi giá trị `field:operator:value`.
 * - `sort` lặp lại, mỗi giá trị `field:DIR[,field2:DIR2]`.
 */
export interface SearchListParams {
  page?: number;
  limit?: number;
  keyword?: string;
  /** Mỗi phần tử `field:operator:value` — gửi lặp lại `filters=`. */
  filters?: string[];
  /** Mỗi phần tử `field:DIR[,field2:DIR2]` — gửi lặp lại `sort=`. */
  sort?: string[];
}

/**
 * axios mặc định serialize mảng thành `filters[]=` (backend bỏ qua).
 * `arrayFormat: 'repeat'` phát `filters=a&filters=b`.
 */
export function serializeListParams(params: SearchListParams): string {
  return qs.stringify(params, { arrayFormat: 'repeat', skipNulls: true });
}

/** Ghép query string vào path — không thêm `?` khi không có param. */
export function withListParams(path: string, params: SearchListParams = {}): string {
  const query = serializeListParams(params);
  return query ? `${path}?${query}` : path;
}
