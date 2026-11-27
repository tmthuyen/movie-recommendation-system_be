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
  countryIds?: number[];
  peopleIds?: number[];
}

/** `PATCH /movies/:id` nhận `Partial<CreateMovieDto>` — field không gửi giữ nguyên. */
export type MovieAdminUpdateInput = Partial<MovieAdminInput>;

/** Option thể loại TMDB — `GET /api/movies/tmdb/options/genres`. */
export interface TmdbGenreOption {
  id: number;
  name: string;
}

/** Option ngôn ngữ TMDB — `GET /api/movies/tmdb/options/languages`. */
export interface TmdbLanguageOption {
  code: string;
  englishName: string;
  name: string;
}

/** Chế độ discover: phổ biến hoặc theo ngày phát hành. */
export type TmdbDiscoverMode = 'popularity' | 'release-year';

/** Query của `GET /api/movies/tmdb/discover` (camelCase theo envelope backend). */
export interface TmdbDiscoverParams {
  mode?: TmdbDiscoverMode;
  page?: number;
  limit?: number;
  releaseDateFrom?: string;
  releaseDateTo?: string;
  releaseYearFrom?: number;
  releaseYearTo?: number;
  /** UI scanner chọn đơn → chỉ bao giờ có 1 phần tử. */
  genreIds?: number[];
  originalLanguage?: string;
}

/** Candidate chưa lưu DB, trả về từ `/tmdb/discover`. */
export interface TmdbMovieCandidate {
  tmdbId: number;
  imdbId: string | null;
  title: string;
  titleVi: string | null;
  overview: string;
  overviewVi: string | null;
  releaseDate: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  homepage: string | null;
  originCountry: string | null;
  originalLanguage: string | null;
  budget: number;
  revenue: number;
  status: string | null;
  video: boolean;
  tmdbRating: number | null;
  voteAverage: number | null;
  voteCount: number;
  genres: Array<{ id: number; name: string }>;
}

/** Body của `POST /api/movies/tmdb/import` — gửi 1 id hoặc nhiều id. */
export interface TmdbImportPayload {
  tmdbId?: number;
  tmdbIds?: number[];
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

  /** Option thể loại TMDB cho bộ lọc scanner (ADMIN). */
  getTmdbGenres: async (): Promise<ApiResponse<TmdbGenreOption[]>> => {
    const { data } = await axiosClient.get('/movies/tmdb/options/genres');
    return data;
  },
  /** Option ngôn ngữ TMDB cho bộ lọc scanner (ADMIN). */
  getTmdbLanguages: async (): Promise<ApiResponse<TmdbLanguageOption[]>> => {
    const { data } = await axiosClient.get('/movies/tmdb/options/languages');
    return data;
  },
  /** Discover candidate mới từ TMDB, đã loại phim trùng DB (ADMIN). */
  discoverTmdb: async (
    params: TmdbDiscoverParams,
  ): Promise<ApiPaginatedResponse<TmdbMovieCandidate[]>> => {
    const queryString = qs.stringify(params, { arrayFormat: 'repeat', skipNulls: true });
    const { data } = await axiosClient.get(`/movies/tmdb/discover?${queryString}`);
    return data;
  },
  /** Import một hoặc nhiều candidate TMDB vào DB (ADMIN). */
  importTmdb: async (input: TmdbImportPayload): Promise<ApiResponse<Movie[]>> => {
    const { data } = await axiosClient.post('/movies/tmdb/import', input);
    return data;
  },
};
