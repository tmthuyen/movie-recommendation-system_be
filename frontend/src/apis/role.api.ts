import { ApiPaginatedResponse, ApiResponse, Role } from '@/shared/types/api.types';
import {
  serializeListParams,
  withListParams,
  type SearchListParams,
} from '@/shared/utils/list-params';
import axiosClient from '../lib/axiosClient';

/** Input tạo role — khớp `CreateRoleDto`; `UpdateRoleDto` = Partial. */
export interface RoleInput {
  code: string;
  name: string;
  description?: string;
}

/**
 * Query params cho `GET /roles` — khớp `BaseSearchRequest` của backend.
 * Xem whitelist field/operator trong `docs/BACKEND.md`.
 */
export type RoleListParams = SearchListParams;

/** Giữ export cũ cho tương thích (uỷ quyền cho serializer dùng chung). */
export function serializeRoleListParams(params: RoleListParams): string {
  return serializeListParams(params);
}

export const roleApi = {
  /** Danh sách vai trò có phân trang + keyword/filter/sort (ADMIN/MANAGER). */
  getAll: async (params: RoleListParams = {}): Promise<ApiPaginatedResponse<Role[]>> => {
    const { data } = await axiosClient.get(withListParams('/roles', params));
    return data;
  },
  /** Tạo vai trò (JWT). */
  create: async (input: RoleInput): Promise<ApiResponse<Role>> => {
    const { data } = await axiosClient.post('/roles', input);
    return data;
  },
  /** Cập nhật vai trò (JWT) — backend nhận `PATCH`. */
  update: async (id: number | string, input: Partial<RoleInput>): Promise<ApiResponse<Role>> => {
    const { data } = await axiosClient.patch(`/roles/${id}`, input);
    return data;
  },
  /** Xóa vai trò (JWT). */
  remove: async (id: number | string): Promise<ApiResponse<null>> => {
    const { data } = await axiosClient.delete(`/roles/${id}`);
    return data;
  },
};
