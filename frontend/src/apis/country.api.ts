import { ApiPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import { Country } from '@/shared/types/movie.types';
import { withListParams, type SearchListParams } from '@/shared/utils/list-params';
import axiosClient from '../lib/axiosClient';

/** Query params `GET /countries` — khớp `BaseSearchRequest` + cờ public. */
export type CountryQuery = SearchListParams & {
  /** `true`: chỉ trả country có ít nhất một phim trong `movie_countries`. */
  hasMovies?: boolean;
};

export const countryApi = {
  /** Danh sách quốc gia. Admin không truyền `hasMovies` để lấy full. */
  getAll: async (params: CountryQuery = {}): Promise<ApiPaginatedResponse<Country[]>> => {
    const { data } = await axiosClient.get(withListParams('/countries', params));
    return data;
  },
  /** Chi tiết quốc gia theo id (public). */
  getById: async (id: number | string): Promise<ApiResponse<Country>> => {
    const { data } = await axiosClient.get(`/countries/${id}`);
    return data;
  },
  /** Tạo mới (ADMIN). */
  create: async (input: {
    viName: string;
    enName: string;
    code: string;
    region: string;
  }): Promise<ApiResponse<Country>> => {
    const { data } = await axiosClient.post('/countries', input);
    return data;
  },
  /** Cập nhật (ADMIN) — backend nhận `PATCH`. */
  update: async (id: number | string, input: Partial<Country>): Promise<ApiResponse<Country>> => {
    const { data } = await axiosClient.patch(`/countries/${id}`, input);
    return data;
  },
  /** Xóa (ADMIN). */
  remove: async (id: number | string): Promise<ApiResponse<null>> => {
    const { data } = await axiosClient.delete(`/countries/${id}`);
    return data;
  },
};
