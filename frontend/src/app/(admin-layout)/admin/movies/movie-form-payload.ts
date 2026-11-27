import type { MovieAdminInput, MovieAdminUpdateInput } from '@/apis/movie.api';
import type {
  AdminFormDirtyFields,
  AdminFormValues,
} from '@/components/admin/data-view/admin-form-schema';

const TEXT_FIELDS = [
  'title',
  'titleVi',
  'status',
  'releaseDate',
  'originCountry',
  'originalLanguage',
  'posterPath',
  'backdropPath',
  'overview',
  'overviewVi',
] as const;

const ARRAY_FIELDS = ['genreIds', 'countryIds', 'peopleIds'] as const;

function optionalText(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text ? text : undefined;
}

function toNumberArray(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  // Mảng rỗng là lệnh "xoá toàn bộ quan hệ" — phải gửi `[]`, không được gửi `undefined`.
  return value.map(Number).filter((item) => Number.isFinite(item));
}

function buildCreateInput(values: AdminFormValues): MovieAdminInput {
  return {
    title: String(values.title ?? '').trim(),
    titleVi: optionalText(values.titleVi),
    status: optionalText(values.status),
    releaseDate: optionalText(values.releaseDate),
    originCountry: optionalText(values.originCountry),
    originalLanguage: optionalText(values.originalLanguage),
    posterPath: optionalText(values.posterPath),
    backdropPath: optionalText(values.backdropPath),
    overview: optionalText(values.overview),
    overviewVi: optionalText(values.overviewVi),
    genreIds: toNumberArray(values.genreIds),
    countryIds: toNumberArray(values.countryIds),
    peopleIds: toNumberArray(values.peopleIds),
  };
}

/**
 * Tạo payload cho `POST /movies` (đủ field) hoặc `PATCH /movies/:id` (chỉ field dirty).
 * FE chỉ gửi id của người tham gia — backend giữ `role` của `movie_peoples`.
 */
export function buildMoviePayload(
  values: AdminFormValues,
  dirtyFields: AdminFormDirtyFields,
  isEdit: false,
): MovieAdminInput;
export function buildMoviePayload(
  values: AdminFormValues,
  dirtyFields: AdminFormDirtyFields,
  isEdit: true,
): MovieAdminUpdateInput;
export function buildMoviePayload(
  values: AdminFormValues,
  dirtyFields: AdminFormDirtyFields,
  isEdit: boolean,
): MovieAdminInput | MovieAdminUpdateInput {
  if (!isEdit) return buildCreateInput(values);

  const payload: MovieAdminUpdateInput = {};

  for (const name of TEXT_FIELDS) {
    if (dirtyFields[name] === true) {
      payload[name] = optionalText(values[name]);
    }
  }

  for (const name of ARRAY_FIELDS) {
    if (dirtyFields[name] === true) {
      payload[name] = toNumberArray(values[name]) ?? [];
    }
  }

  return payload;
}
