/** TTL của 2 key ma trận thể loại (12 giờ). */
export const GENRE_MATRIX_TTL_SECONDS = 12 * 60 * 60;

/** Số phim giữ lại cho mỗi thể loại. */
export const TOP_MOVIES_PER_GENRE = 100;

/** Thời gian chạy cron job refresh ma trận thể loại (1 phút). */
export const GENRE_MATRIX_CRON = '0 */1 * * *';

/** Lock chống chạy trùng job refresh ma trận thể loại. */
export const GENRE_MATRIX_LOCK_KEY = 'cache:stats:genre:refresh:lock';

/** TTL lock, đủ dài để job đọc DB và ghi pipeline. */
export const GENRE_MATRIX_LOCK_TTL_SECONDS = 10 * 60;
