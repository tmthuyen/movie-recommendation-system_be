import { z } from 'zod';

const PaginationSchema = z.looseObject({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
});

/** Schema cho `PaginatedResult<T>` của repository: `{data, page, limit, total, totalPages}`. */
export const PagedResultSchema = <T extends z.ZodType>(item: T) =>
  z.looseObject({
    data: z.array(item),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  });

/** Schema cho `ResultWithPagination<T>` của service: `{result, pagination}`. */
export const ResultWithPaginationSchema = <T extends z.ZodType>(item: T) =>
  z.object({ result: z.array(item), pagination: PaginationSchema });

const MovieKeyFields = z.looseObject({
  id: z.number().int().positive(),
  title: z.string(),
});

/** Chi tiết phim: validate `id`/`title`, giữ nguyên các field còn lại. */
export const MovieDetailCacheSchema = MovieKeyFields;

/** Danh sách phim phân trang. */
export const MovieListCacheSchema = PagedResultSchema(MovieKeyFields);

/** Kết quả tìm kiếm phim phân trang. */
export const MovieSearchCacheSchema =
  ResultWithPaginationSchema(MovieKeyFields);

const GenreKeyFields = z.looseObject({
  id: z.number().int().positive(),
  name: z.string(),
});

const CountryKeyFields = z.looseObject({
  id: z.number().int().positive(),
  viName: z.string(),
});

/** Danh sách thể loại phân trang. */
export const GenreListCacheSchema = PagedResultSchema(GenreKeyFields);

/** Danh sách quốc gia phân trang. */
export const CountryListCacheSchema = PagedResultSchema(CountryKeyFields);

/** Số liệu tương tác của một phim. */
export const InteractionStatsCacheSchema = z.strictObject({
  likeCount: z.number().int().nonnegative(),
  commentCount: z.number().int().nonnegative(),
  viewCount: z.number().int().nonnegative(),
  ratingCount: z.number().int().nonnegative(),
  voteAverage: z.number().min(0).max(10),
});

/** Một phần tử trong snapshot gợi ý phim. */
export const RecommendationItemSchema = z.strictObject({
  id: z.number().int().positive(),
  score: z.number().min(0).max(1),
  rank: z.number().int().positive(),
});

/**
 * Snapshot gợi ý: mảng item đã sắp xếp theo `rank` tăng dần, không trùng `id`,
 * tối đa 200 phần tử.
 */
export const RecommendationSnapshotSchema = z
  .array(RecommendationItemSchema)
  .max(200)
  .superRefine((items, ctx) => {
    const ids = new Set(items.map(item => item.id));
    if (ids.size !== items.length) {
      ctx.addIssue({ code: 'custom', message: 'duplicate movie id' });
    }
    items.forEach((item, index) => {
      if (item.rank !== index + 1) {
        ctx.addIssue({
          code: 'custom',
          message: `rank lệch tại index ${index}`,
        });
      }
    });
  });
