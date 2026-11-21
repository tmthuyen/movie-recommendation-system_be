import { ApiPaginatedResponse, ApiResponse } from '@/shared/types/api.types';
import { Movie, MovieDetail, MovieQuery } from '@/shared/types/movie.types';
import { withListParams, type SearchListParams } from '@/shared/utils/list-params';
import { toInteractionGenres, type InteractionGenrePayload } from '@/shared/utils/movie';
import axiosClient from '../lib/axiosClient';

import qs from 'qs';

/**
 * Input tạo/cập nhật phim — khớp `CreateMovieDto` của backend
 * (`UpdateMovieDto` = Partial). Id dạng string ở client (bigint).
 */
export interface MovieAdminInput {
  title: string;
  titleVi?: string;
  overview?: string;
  overviewVi?: string;
  releaseDate?: string;
  posterPath?: string;
  backdropPath?: string;
  originCountry?: string;
  originalLanguage?: string;
  budget?: number;
  revenue?: number;
  status?: string;
  video?: boolean;
  genreIds?: number[];
  countryId?: number;
  peopleIds?: number[];
}

export const movieApi = {
  /** Danh sách phim (public) — hỗ trợ `BaseSearchRequest` (keyword/filter/sort). */
  getAll: async (params: SearchListParams = {}): Promise<ApiPaginatedResponse<Movie[]>> => {
    const { data } = await axiosClient.get(withListParams('/movies', params));
    return data;
  },
  /** Chi tiết phim theo id (public). */
  getById: async (id: number): Promise<ApiResponse<MovieDetail>> => {
    const { data } = await axiosClient.get(`/movies/${id}`);
    return data;
  },
  /** Tăng lượt xem/click cho phim (public, optional auth) kèm genre để cập nhật user vector. */
  incrementView: async (
    id: number,
    genres?: InteractionGenrePayload[],
  ): Promise<
    ApiResponse<{
      viewCount: number;
      score: number;
      interaction: 'created' | 'updated' | 'none';
    }>
  > => {
    const normalizedGenres = toInteractionGenres(genres);
    const { data } = normalizedGenres
      ? await axiosClient.post(`/movies/${id}/view`, { genres: normalizedGenres })
      : await axiosClient.post(`/movies/${id}/view`);
    return data;
  },
  /** Tạo phim (ADMIN). */
  create: async (input: MovieAdminInput): Promise<ApiResponse<Movie>> => {
    const { data } = await axiosClient.post('/movies', input);
    return data;
  },
  /** Cập nhật phim (ADMIN) — backend nhận `PATCH`. */
  update: async (id: number, input: Partial<MovieAdminInput>): Promise<ApiResponse<Movie>> => {
    const { data } = await axiosClient.patch(`/movies/${id}`, input);
    return data;
  },
  /** Xóa phim (ADMIN). */
  remove: async (id: number): Promise<ApiResponse<null>> => {
    const { data } = await axiosClient.delete(`/movies/${id}`);
    return data;
  },
  /** Tìm kiếm phim (PUBLIC).
   * /api/movies/search?keyword=...&page=...&limit=...&sort=releaseDate:DESC,voteAverage:ASC
   */
  search: async (
    params: MovieQuery = {
      page: 1,
      limit: 10,
      sort: 'releaseDate:DESC',
    },
  ): Promise<ApiPaginatedResponse<Movie[]>> => {
    const queryString = qs.stringify(params, { arrayFormat: 'repeat' });
    const { data } = await axiosClient.get(`/movies/search?${queryString}`);
    return data;
  },
};
