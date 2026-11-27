import { commentApi } from '@/apis/comment.api';
import { countryApi } from '@/apis/country.api';
import { genreApi } from '@/apis/genre.api';
import { interactionApi } from '@/apis/interaction.api';
import { movieApi, MovieAdminInput, MovieAdminUpdateInput } from '@/apis/movie.api';
import { peopleApi, PeopleInput } from '@/apis/people.api';
import { ratingApi } from '@/apis/rating.api';
import { roleApi, RoleInput } from '@/apis/role.api';
import { userApi } from '@/apis/user.api';
import { Genre, Role, User } from '@/shared/types/api.types';
import { Country, Movie, People } from '@/shared/types/movie.types';
import { createCrudHooks, useDeleteOnly, usePagedList } from './admin-crud';

/**
 * Bộ hooks CRUD admin theo domain — mỗi domain dùng chung factory `createCrudHooks`
 * (query list phân trang + create/update/delete với invalidate + toast).
 * QueryKey root riêng `admin-*` để không conflict shape cache phía user.
 */

export const adminGenres = createCrudHooks<Genre, { name: string; enName?: string }>({
  domain: 'admin-genres',
  list: genreApi.getAll,
  create: genreApi.create,
  update: (id, data) => genreApi.update(String(id), data),
  remove: (id) => genreApi.delete(String(id)),
});

export const adminCountries = createCrudHooks<
  Country,
  { viName: string; enName: string; code: string; region: string }
>({
  domain: 'admin-countries',
  list: ({ page, limit }) => countryApi.getAll({ page, limit: limit }),
  create: countryApi.create,
  update: (id, data) => countryApi.update(id, data),
  remove: countryApi.remove,
});

export const adminPeoples = createCrudHooks<People, PeopleInput>({
  domain: 'admin-peoples',
  list: peopleApi.getAll,
  create: peopleApi.create,
  update: (id, data) => peopleApi.update(id, data),
  remove: peopleApi.remove,
});

export const adminMovies = createCrudHooks<Movie, MovieAdminInput, MovieAdminUpdateInput>({
  domain: 'admin-movies',
  list: movieApi.getAll,
  create: movieApi.create,
  update: (id: string | number, data: MovieAdminUpdateInput) => movieApi.update(Number(id), data),
  remove: (id: string | number) => movieApi.remove(Number(id)),
});

/** Users — id là uuid (string); gán vai trò qua `PATCH /users/:id/roles` (form riêng). */
export type AdminUserInput = {
  /** Bắt buộc khi tạo; `PUT /users/me` dùng `UpdateProfileDto` (không nhận email). */
  email?: string;
  fullName: string;
  password?: string;
  confirmPassword?: string;
  phoneNumber?: string;
  birthDate?: string;
  gender?: string;
  avatarUrl?: string;
  /** `PUT /users/:id` nhận `AdminUpdateUserDto` (khác `UpdateProfileDto` của `/users/me`). */
  status?: string;
  isVerified?: boolean;
  /** Chỉ dùng khi tạo (`CreateUserDto`). */
  roleIds?: number[];
};

/** `PUT /users/:id` nhận từng field dirty, không bắt buộc `fullName` như lúc tạo. */
export type AdminUserUpdateInput = Partial<AdminUserInput>;

export const adminUsers = createCrudHooks<User, AdminUserInput, AdminUserUpdateInput>({
  domain: 'admin-users',
  list: userApi.getAllUsers,
  create: userApi.createUser,
  update: (id, data) => userApi.updateUserAdmin(id, data),
  remove: userApi.deleteUser,
});

/** Roles — `GET /api/roles` đã hỗ trợ phân trang + keyword/filter/sort. */
export const adminRoles = createCrudHooks<Role, RoleInput>({
  domain: 'admin-roles',
  list: roleApi.getAll,
  create: roleApi.create,
  update: (id, data) => roleApi.update(id, data),
  remove: roleApi.remove,
});

/**
 * Trang admin Interaction — 3 danh sách read-only (tương tác/đánh giá/bình luận)
 * + xóa từng bản ghi. Cả 3 endpoint đã hỗ trợ `BaseSearchRequest` (keyword/filter/sort).
 */
/* eslint-disable react-hooks/rules-of-hooks -- usePagedList là FACTORY (trả về hook), không gọi hook nào khi chạy ở module level;see admin-crud.ts */
export const useAdminInteractions = usePagedList('admin-interactions', (params) =>
  interactionApi.getAll(params),
);
export const useAdminRatings = usePagedList('admin-ratings', (params) => ratingApi.getAll(params));
export const useAdminComments = usePagedList('admin-comments', (params) =>
  commentApi.getAll(params),
);
/* eslint-enable react-hooks/rules-of-hooks */

export const useDeleteInteraction = () =>
  useDeleteOnly('admin-interactions', interactionApi.remove);
export const useDeleteRating = () =>
  useDeleteOnly('admin-ratings', (id: string | number) => ratingApi.remove(Number(id)));
export const useDeleteComment = () => useDeleteOnly('admin-comments', commentApi.remove);
