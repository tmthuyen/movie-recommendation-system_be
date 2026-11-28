export class SystemConstant {
  // Cron time
  public static readonly CRON_TIME_TRAINING_UPLOAD = '0 */60 * * * *'; // 60 phút

  public static readonly CRON_TIME_MOVIE_STATS_SYNC = '0 */2 * * * *'; // 2 phút

  public static readonly CRON_TIME_GENRE_MATRIX_REFRESH = '0 */1 * * *'; // 1 phút
}
