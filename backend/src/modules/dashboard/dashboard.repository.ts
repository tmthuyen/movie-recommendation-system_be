import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { Comment } from '@/modules/comments/entities/comment.entity';
import { Genre } from '@/modules/genres/entities/genre.entity';
import { Interaction } from '@/modules/interactions/entities/interaction.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { Rating } from '@/modules/ratings/entities/rating.entity';
import { User } from '@/modules/users/entities/user.entity';
import {
  DashboardActivity,
  DashboardDataQualityIssue,
  DashboardDateRange,
  DashboardInteractionTypeDatum,
  DashboardLabelDatum,
  DashboardRatingBucket,
  DashboardTimePoint,
  DashboardTotals,
} from './dashboard.interfaces';

export const IDASHBOARD_REPOSITORY = Symbol('IDASHBOARD_REPOSITORY');

export interface IDashboardRepository {
  getTotals(range: DashboardDateRange): Promise<DashboardTotals>;
  getTimeSeries(range: DashboardDateRange): Promise<DashboardTimePoint[]>;
  getTopViewed(): Promise<DashboardLabelDatum[]>;
  getGenreDistribution(): Promise<DashboardLabelDatum[]>;
  getCountryDistribution(): Promise<DashboardLabelDatum[]>;
  getInteractionTypes(
    range: DashboardDateRange,
  ): Promise<DashboardInteractionTypeDatum[]>;
  getRatingDistribution(
    range: DashboardDateRange,
  ): Promise<DashboardRatingBucket[]>;
  getTopRated(range: DashboardDateRange): Promise<DashboardLabelDatum[]>;
  getTopActiveUsers(range: DashboardDateRange): Promise<DashboardLabelDatum[]>;
  getDataQualityIssues(): Promise<DashboardDataQualityIssue[]>;
  getRecentActivity(range: DashboardDateRange): Promise<DashboardActivity[]>;
}

interface RawDateCountRow {
  date?: unknown;
  value?: unknown;
}

interface RawLabelRow {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  value?: unknown;
}

interface RawRatingRow {
  score?: unknown;
  value?: unknown;
}

interface RawRatedMovieRow {
  movieId?: unknown;
  title?: unknown;
  titleVi?: unknown;
  average?: unknown;
  votes?: unknown;
}

interface RawActivityRow {
  id?: unknown;
  detail?: unknown;
  createdAt?: unknown;
  userId?: unknown;
  name?: unknown;
  email?: unknown;
  title?: unknown;
  titleVi?: unknown;
}

const TOP_LIMIT = 10;
const RECENT_ACTIVITY_LIMIT = 12;
const MIN_TOP_RATED_VOTES = 2;
const UNKNOWN_LABEL = 'Chưa xác định';
const OTHER_LABEL = 'Khác';

const ACTIVITY_KIND_LABELS = {
  interaction: 'Tương tác',
  rating: 'Đánh giá',
  comment: 'Bình luận',
} as const;

@Injectable()
export class DashboardRepository implements IDashboardRepository {
  constructor(
    @InjectRepository(Movie)
    private readonly movies: Repository<Movie>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Genre)
    private readonly genres: Repository<Genre>,
    @InjectRepository(Interaction)
    private readonly interactions: Repository<Interaction>,
    @InjectRepository(Rating)
    private readonly ratings: Repository<Rating>,
    @InjectRepository(Comment)
    private readonly comments: Repository<Comment>,
  ) {}

  private toCount(value: unknown): number {
    const count = Number(value ?? 0);
    return Number.isFinite(count) ? count : 0;
  }

  private toIdString(value: unknown): string | undefined {
    if (typeof value === 'string' || typeof value === 'number') {
      return String(value);
    }
    return undefined;
  }

  private toDateKey(value: unknown): string | undefined {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime())
        ? undefined
        : value.toISOString().slice(0, 10);
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      return value.slice(0, 10);
    }
    if (typeof value !== 'string' && typeof value !== 'number')
      return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
      ? undefined
      : parsed.toISOString().slice(0, 10);
  }

  private toIsoDate(value: unknown): string | undefined {
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
    }
    if (typeof value !== 'string' && typeof value !== 'number')
      return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  }

  private label(row: RawLabelRow): string {
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const email = typeof row.email === 'string' ? row.email.trim() : '';
    return name || email || UNKNOWN_LABEL;
  }

  private withOther(rows: DashboardLabelDatum[]): DashboardLabelDatum[] {
    const top = rows.slice(0, TOP_LIMIT);
    const rest = rows.slice(TOP_LIMIT).reduce((sum, row) => sum + row.value, 0);
    if (rest > 0) top.push({ label: OTHER_LABEL, value: rest });
    return top;
  }

  private inRange<T extends ObjectLiteral>(
    repository: Repository<T>,
    alias: string,
    range: DashboardDateRange,
  ): SelectQueryBuilder<T> {
    return repository
      .createQueryBuilder(alias)
      .where(`${alias}.createdAt BETWEEN :from AND :to`, {
        from: range.from,
        to: range.to,
      });
  }

  private async countInRange<T extends ObjectLiteral>(
    repository: Repository<T>,
    alias: string,
    range: DashboardDateRange,
  ): Promise<number> {
    return this.inRange(repository, alias, range).getCount();
  }

  private async dailyCounts<T extends ObjectLiteral>(
    repository: Repository<T>,
    alias: string,
    range: DashboardDateRange,
  ): Promise<Map<string, number>> {
    const dayExpression = `DATE(${alias}.createdAt)`;
    const rows = await this.inRange(repository, alias, range)
      .select(dayExpression, 'date')
      .addSelect('COUNT(*)', 'value')
      .groupBy(dayExpression)
      .orderBy(dayExpression, 'ASC')
      .getRawMany<RawDateCountRow>();

    const counts = new Map<string, number>();
    for (const row of rows) {
      const date = this.toDateKey(row.date);
      if (!date) continue;
      counts.set(date, this.toCount(row.value));
    }
    return counts;
  }

  async getTotals(range: DashboardDateRange): Promise<DashboardTotals> {
    const [movies, users, genres, interactions, ratings, comments] =
      await Promise.all([
        this.movies.count(),
        this.users.count(),
        this.genres.count(),
        this.countInRange(this.interactions, 'interaction', range),
        this.countInRange(this.ratings, 'rating', range),
        this.countInRange(this.comments, 'comment', range),
      ]);

    return { movies, users, genres, interactions, ratings, comments };
  }

  async getTimeSeries(
    range: DashboardDateRange,
  ): Promise<DashboardTimePoint[]> {
    const [interactions, ratings, comments] = await Promise.all([
      this.dailyCounts(this.interactions, 'interaction', range),
      this.dailyCounts(this.ratings, 'rating', range),
      this.dailyCounts(this.comments, 'comment', range),
    ]);

    const dates = new Set([
      ...interactions.keys(),
      ...ratings.keys(),
      ...comments.keys(),
    ]);
    return [...dates].sort().map(date => ({
      date,
      interactions: interactions.get(date) ?? 0,
      ratings: ratings.get(date) ?? 0,
      comments: comments.get(date) ?? 0,
    }));
  }

  async getTopViewed(): Promise<DashboardLabelDatum[]> {
    const movies = await this.movies.find({
      order: { viewCount: 'DESC', id: 'ASC' },
      take: TOP_LIMIT,
    });
    return movies.map(movie => ({
      label: movie.titleVi || movie.title || UNKNOWN_LABEL,
      value: this.toCount(movie.viewCount),
    }));
  }

  async getGenreDistribution(): Promise<DashboardLabelDatum[]> {
    const rows = await this.movies
      .createQueryBuilder('movie')
      .select('genre.name', 'name')
      .addSelect('COUNT(DISTINCT movie.id)', 'value')
      .innerJoin('movie.genres', 'genre')
      .groupBy('genre.id')
      .addGroupBy('genre.name')
      .orderBy('value', 'DESC')
      .getRawMany<RawLabelRow>();

    return this.withOther(
      rows.map(row => ({
        label: this.label(row),
        value: this.toCount(row.value),
      })),
    );
  }

  async getCountryDistribution(): Promise<DashboardLabelDatum[]> {
    const rows = await this.movies
      .createQueryBuilder('movie')
      .select('country.viName', 'name')
      .addSelect('COUNT(DISTINCT movie.id)', 'value')
      .leftJoin('movie.countries', 'country')
      .groupBy('country.id')
      .addGroupBy('country.viName')
      .orderBy('value', 'DESC')
      .getRawMany<RawLabelRow>();

    return this.withOther(
      rows.map(row => ({
        label: this.label(row),
        value: this.toCount(row.value),
      })),
    );
  }

  async getInteractionTypes(
    range: DashboardDateRange,
  ): Promise<DashboardInteractionTypeDatum[]> {
    const rows = await this.inRange(this.interactions, 'interaction', range)
      .select('interaction.type', 'type')
      .addSelect('COUNT(*)', 'value')
      .groupBy('interaction.type')
      .orderBy('value', 'DESC')
      .getRawMany<{ type?: unknown; value?: unknown }>();

    return rows
      .map(row => ({
        type: typeof row.type === 'string' ? row.type : UNKNOWN_LABEL,
        value: this.toCount(row.value),
      }))
      .sort((left, right) => right.value - left.value);
  }

  async getRatingDistribution(
    range: DashboardDateRange,
  ): Promise<DashboardRatingBucket[]> {
    const rows = await this.inRange(this.ratings, 'rating', range)
      .select('rating.rating', 'score')
      .addSelect('COUNT(*)', 'value')
      .groupBy('rating.rating')
      .getRawMany<RawRatingRow>();

    const buckets = new Map<number, number>();
    for (const row of rows) {
      const star = Math.round(this.toCount(row.score));
      buckets.set(star, (buckets.get(star) ?? 0) + this.toCount(row.value));
    }

    return [...buckets.entries()]
      .sort(([left], [right]) => left - right)
      .map(([rating, value]) => ({ rating, value }));
  }

  async getTopRated(range: DashboardDateRange): Promise<DashboardLabelDatum[]> {
    const rows = await this.inRange(this.ratings, 'rating', range)
      .select('movie.id', 'movieId')
      .addSelect('movie.title', 'title')
      .addSelect('movie.titleVi', 'titleVi')
      .addSelect('AVG(rating.rating)', 'average')
      .addSelect('COUNT(*)', 'votes')
      .innerJoin('rating.movie', 'movie')
      .groupBy('movie.id')
      .addGroupBy('movie.title')
      .addGroupBy('movie.titleVi')
      .having('COUNT(*) >= :minVotes', { minVotes: MIN_TOP_RATED_VOTES })
      .orderBy('average', 'DESC')
      .limit(TOP_LIMIT)
      .getRawMany<RawRatedMovieRow>();

    return rows.map(row => ({
      label:
        (typeof row.titleVi === 'string' && row.titleVi) ||
        (typeof row.title === 'string' && row.title) ||
        UNKNOWN_LABEL,
      value: Math.round(this.toCount(row.average) * 10) / 10,
    }));
  }

  private async activeUsersFrom<T extends ObjectLiteral>(
    repository: Repository<T>,
    alias: string,
    range: DashboardDateRange,
  ): Promise<RawLabelRow[]> {
    return this.inRange(repository, alias, range)
      .select('user.id', 'id')
      .addSelect('user.fullName', 'name')
      .addSelect('user.email', 'email')
      .addSelect('COUNT(*)', 'value')
      .innerJoin(`${alias}.user`, 'user')
      .groupBy('user.id')
      .addGroupBy('user.fullName')
      .addGroupBy('user.email')
      .getRawMany<RawLabelRow>();
  }

  async getTopActiveUsers(
    range: DashboardDateRange,
  ): Promise<DashboardLabelDatum[]> {
    const [interactions, ratings, comments] = await Promise.all([
      this.activeUsersFrom(this.interactions, 'interaction', range),
      this.activeUsersFrom(this.ratings, 'rating', range),
      this.activeUsersFrom(this.comments, 'comment', range),
    ]);

    const totals = new Map<string, DashboardLabelDatum>();
    for (const row of [...interactions, ...ratings, ...comments]) {
      const key = this.toIdString(row.id) ?? UNKNOWN_LABEL;
      const current = totals.get(key) ?? { label: this.label(row), value: 0 };
      current.value += this.toCount(row.value);
      totals.set(key, current);
    }

    const sorted = [...totals.values()].sort(
      (left, right) => right.value - left.value,
    );
    return this.withOther(sorted);
  }

  async getDataQualityIssues(): Promise<DashboardDataQualityIssue[]> {
    const [missingPoster, missingOverview, missingGenres, missingCountries] =
      await Promise.all([
        this.movies
          .createQueryBuilder('movie')
          .where("movie.posterPath IS NULL OR movie.posterPath = ''")
          .getCount(),
        this.movies
          .createQueryBuilder('movie')
          .where(
            "(movie.overview IS NULL OR movie.overview = '') AND (movie.overviewVi IS NULL OR movie.overviewVi = '')",
          )
          .getCount(),
        this.movies
          .createQueryBuilder('movie')
          .leftJoin('movie.genres', 'genre')
          .where('genre.id IS NULL')
          .getCount(),
        this.movies
          .createQueryBuilder('movie')
          .leftJoin('movie.countries', 'country')
          .where('country.id IS NULL')
          .getCount(),
      ]);

    return [
      {
        label: 'Thiếu poster',
        description:
          'Phim không có ảnh poster — hiển thị xấu ở danh sách/chi tiết.',
        count: missingPoster,
        href: '/admin/movies',
      },
      {
        label: 'Thiếu mô tả',
        description: 'Chưa có overview/overviewVi.',
        count: missingOverview,
        href: '/admin/movies',
      },
      {
        label: 'Chưa gắn thể loại',
        description:
          'Không có thể loại → không xuất hiện trong lọc theo thể loại.',
        count: missingGenres,
        href: '/admin/movies',
      },
      {
        label: 'Chưa gắn quốc gia',
        description: 'Không có quốc gia sản xuất.',
        count: missingCountries,
        href: '/admin/movies',
      },
    ].filter(issue => issue.count > 0);
  }

  private async recentFrom<T extends ObjectLiteral>(
    repository: Repository<T>,
    alias: string,
    range: DashboardDateRange,
    kind: keyof typeof ACTIVITY_KIND_LABELS,
  ): Promise<DashboardActivity[]> {
    const detailExpression =
      kind === 'rating'
        ? 'rating.rating'
        : kind === 'comment'
          ? 'comment.content'
          : 'interaction.type';

    const rows = await this.inRange(repository, alias, range)
      .select(`${alias}.id`, 'id')
      .addSelect(`${alias}.createdAt`, 'createdAt')
      .addSelect('user.id', 'userId')
      .addSelect('user.fullName', 'name')
      .addSelect('user.email', 'email')
      .addSelect('movie.title', 'title')
      .addSelect('movie.titleVi', 'titleVi')
      .addSelect(detailExpression, 'detail')
      .leftJoin(`${alias}.user`, 'user')
      .leftJoin(`${alias}.movie`, 'movie')
      .orderBy(`${alias}.createdAt`, 'DESC')
      .limit(RECENT_ACTIVITY_LIMIT)
      .getRawMany<RawActivityRow>();

    return rows.map(row => ({
      id: `${kind}-${this.toIdString(row.id) ?? ''}`,
      kind,
      kindLabel: ACTIVITY_KIND_LABELS[kind],
      createdAt: this.toIsoDate(row.createdAt),
      userName: this.label(row),
      userEmail: typeof row.email === 'string' ? row.email : undefined,
      movieTitle:
        (typeof row.titleVi === 'string' && row.titleVi) ||
        (typeof row.title === 'string' && row.title) ||
        UNKNOWN_LABEL,
      detail:
        kind === 'rating'
          ? `${this.toCount(row.detail)} sao`
          : typeof row.detail === 'string'
            ? row.detail
            : '',
    }));
  }

  async getRecentActivity(
    range: DashboardDateRange,
  ): Promise<DashboardActivity[]> {
    const [interactions, ratings, comments] = await Promise.all([
      this.recentFrom(this.interactions, 'interaction', range, 'interaction'),
      this.recentFrom(this.ratings, 'rating', range, 'rating'),
      this.recentFrom(this.comments, 'comment', range, 'comment'),
    ]);

    return [...interactions, ...ratings, ...comments]
      .sort(
        (left, right) =>
          new Date(right.createdAt ?? 0).getTime() -
          new Date(left.createdAt ?? 0).getTime(),
      )
      .slice(0, RECENT_ACTIVITY_LIMIT);
  }
}
