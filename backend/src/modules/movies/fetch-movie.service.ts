import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { AppException } from '@/common/custom-exception/app-exception';
import {
  CACHE_SERVICE,
  type ICacheService,
} from '@/infrastructure/cache/redis-cache.service';
import { CacheKeys } from '@/infrastructure/cache/cache.keys';
import { MovieProducer } from '@/infrastructure/messaging/producers/movie.producer';
import { TmdbDiscoverRequestDto } from './dto/tmdb-discover-request.dto';
import { IMovieRepository } from './movies.repository';
import { IGenreRepository } from '@/modules/genres/genres.repository';
import { Movie } from './entities/movie.entity';
import { Genre } from '@/modules/genres/entities/genre.entity';
import { Country } from '@/modules/countries/entities/country.entity';
import { ICountryRepository } from '@/modules/countries/countries.repository';
import { IFetchMovieService } from './interfaces/fetch-movie.interface';
import { TmdbMovieClient } from './tmdb/tmdb-movie-client';
import { TmdbMovieCandidate, TmdbMovieDetail } from './tmdb/tmdb-movie.types';

@Injectable()
export class FetchMovieService implements IFetchMovieService {
  private readonly logger = new Logger(FetchMovieService.name);

  constructor(
    private readonly tmdbClient: TmdbMovieClient,
    private readonly configService: ConfigService,
    @Inject(IMovieRepository)
    private readonly movieRepository: IMovieRepository,
    @Inject(IGenreRepository)
    private readonly genreRepository: IGenreRepository,
    @Inject(ICountryRepository)
    private readonly countryRepository: ICountryRepository,
    private readonly movieProducer: MovieProducer,
    @Inject(CACHE_SERVICE)
    private readonly cache: ICacheService,
  ) {}

  async discover(
    request: TmdbDiscoverRequestDto,
  ): Promise<TmdbMovieCandidate[]> {
    this.requireToken();
    const limit = request.limit ?? 10;
    const candidates: TmdbMovieCandidate[] = [];
    const seen = new Set<number>();
    let page = request.page ?? 1;

    while (candidates.length < limit && page <= (request.page ?? 1) + 4) {
      let discovered: Awaited<ReturnType<TmdbMovieClient['discover']>>;
      try {
        discovered = await this.tmdbClient.discover(
          this.buildDiscoverParams(request, page),
        );
      } catch (error) {
        throw this.toTmdbAppException(error, 'quét phim từ TMDB');
      }

      for (const item of discovered.results || []) {
        if (candidates.length >= limit) break;
        if (!Number.isInteger(item.id) || item.id <= 0) continue;
        if (seen.has(item.id)) continue;
        seen.add(item.id);

        const existing = await this.movieRepository.findByTmdbId(item.id);
        if (existing) continue;

        const candidate = await this.getCandidate(item.id);
        if (candidate) candidates.push(candidate);
      }

      if (page >= discovered.total_pages) break;
      page++;
    }

    this.logger.log(
      `TMDB discover: mode=${request.mode}, page=${request.page ?? 1}, candidates=${candidates.length}`,
    );
    return candidates;
  }

  async importOne(tmdbId: number): Promise<Movie | null> {
    this.requireToken();
    if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'TMDB ID không hợp lệ',
        'tmdbId must be a positive integer',
        'INVALID_TMDB_ID',
      );
    }

    const existing = await this.movieRepository.findByTmdbId(tmdbId);
    if (existing) return null;

    const candidate = await this.getCandidate(tmdbId);
    if (!candidate) return null;
    return this.saveCandidate(candidate);
  }

  async importMany(tmdbIds: number[]): Promise<Movie[]> {
    const saved: Movie[] = [];
    const uniqueIds = new Set(tmdbIds);

    for (const tmdbId of uniqueIds) {
      const movie = await this.importOne(tmdbId);
      if (movie) saved.push(movie);
    }

    return saved;
  }

  async discoverAndImport(request: TmdbDiscoverRequestDto): Promise<Movie[]> {
    const candidates = await this.discover(request);
    const saved: Movie[] = [];

    for (const candidate of candidates) {
      const movie = await this.saveCandidate(candidate);
      if (movie) saved.push(movie);
    }

    return saved;
  }

  private requireToken(): void {
    const credential = this.configService.get<string>('TMDB_API_TOKEN');
    if (!credential) {
      throw new AppException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'Chưa cấu hình TMDB credential',
        'TMDB_API_TOKEN or TMDB_API_KEY is missing',
        'TMDB_NOT_CONFIGURED',
      );
    }
  }

  private buildDiscoverParams(
    request: TmdbDiscoverRequestDto,
    page: number,
  ): Record<string, string | number> {
    const params: Record<string, string | number> = {
      language: 'en-US',
      include_adult: 'false',
      include_video: 'false',
      page,
    };

    if (request.mode === 'release-year') {
      params.sort_by = 'primary_release_date.desc';
      if (request.releaseYearFrom) {
        params['primary_release_date.gte'] = `${request.releaseYearFrom}-01-01`;
      }
      if (request.releaseYearTo) {
        params['primary_release_date.lte'] = `${request.releaseYearTo}-12-31`;
      }
    } else {
      params.sort_by = 'popularity.desc';
      if (request.releaseDateFrom) {
        params['primary_release_date.gte'] = request.releaseDateFrom;
      }
      if (request.releaseDateTo) {
        params['primary_release_date.lte'] = request.releaseDateTo;
      }
    }

    if (request.genreIds?.length) {
      const separator = request.genreMode === 'and' ? ',' : '|';
      params.with_genres = request.genreIds.join(separator);
    }

    if (request.originalLanguage) {
      params.with_original_language = request.originalLanguage;
    }

    return params;
  }

  private async getCandidate(
    tmdbId: number,
  ): Promise<TmdbMovieCandidate | null> {
    let english: TmdbMovieDetail;
    try {
      english = await this.tmdbClient.getDetail(tmdbId, 'en-US');
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null;
      }
      throw this.toTmdbAppException(error, `lấy movie TMDB ${tmdbId}`);
    }

    let vietnamese: TmdbMovieDetail | null = null;
    try {
      vietnamese = await this.tmdbClient.getDetail(tmdbId, 'vi-VN');
    } catch (error) {
      if (!(error instanceof AxiosError && error.response?.status === 404)) {
        this.logger.warn(
          `Không lấy được bản dịch tiếng Việt: tmdbId=${tmdbId}`,
        );
      }
    }

    const title = english.title?.trim() || english.original_title?.trim();
    const overview = english.overview?.trim();
    if (!title || !overview) return null;
    if (!english.poster_path?.trim()) return null;
    if (!english.backdrop_path?.trim()) return null;

    const releaseDate = english.release_date?.trim();
    const viTitle = vietnamese?.title?.trim();
    const viOverview = vietnamese?.overview?.trim();

    return {
      tmdbId,
      imdbId: null,
      title,
      titleVi:
        viTitle && viTitle !== english.original_title?.trim() ? viTitle : null,
      overview,
      overviewVi: viOverview || null,
      releaseDate: releaseDate || null,
      posterPath: english.poster_path,
      backdropPath: english.backdrop_path,
      homepage: english.homepage?.trim() || null,
      originCountry: english.origin_country?.[0] || null,
      originalLanguage: english.original_language || null,
      budget: english.budget || 0,
      revenue: english.revenue || 0,
      status: english.status?.trim() || null,
      video: english.video || false,
      tmdbRating: english.vote_average || null,
      voteAverage: english.vote_average || null,
      voteCount: english.vote_count || 0,
      genres: english.genres || [],
    };
  }

  private async saveCandidate(
    candidate: TmdbMovieCandidate,
  ): Promise<Movie | null> {
    const existing = await this.movieRepository.findByTmdbId(candidate.tmdbId);
    if (existing) return null;

    const genres = await this.resolveGenres(candidate.genres);
    const countries = await this.resolveCountries(candidate.originCountry);
    const saved = await this.movieRepository.create({
      tmdbId: candidate.tmdbId,
      imdbId: candidate.imdbId || undefined,
      title: candidate.title,
      titleVi: candidate.titleVi || undefined,
      overview: candidate.overview,
      overviewVi: candidate.overviewVi || undefined,
      releaseDate: candidate.releaseDate || undefined,
      posterPath: candidate.posterPath || undefined,
      backdropPath: candidate.backdropPath || undefined,
      homepage: candidate.homepage || undefined,
      originCountry: candidate.originCountry || undefined,
      originalLanguage: candidate.originalLanguage || undefined,
      budget: candidate.budget,
      revenue: candidate.revenue,
      status: candidate.status || undefined,
      video: candidate.video,
      isAiTranslated: false,
      tmdbRating: candidate.tmdbRating || undefined,
      voteAverage: candidate.voteAverage || undefined,
      voteCount: candidate.voteCount,
      genres,
      countries,
    });

    await this.cache.incr(CacheKeys.movie.listVersion());
    await this.movieProducer.publishMovieCreated({
      movieId: Number(saved.id),
      title: saved.title,
      titleVi: saved.titleVi,
      overview: saved.overview,
      overviewVi: saved.overviewVi,
      genres: genres.map(genre => genre.name),
    });

    this.logger.log(
      `Đã import movie từ TMDB: tmdbId=${candidate.tmdbId}, movieId=${saved.id}`,
    );
    return saved;
  }

  private async resolveGenres(
    tmdbGenres: Array<{ id: number; name: string }>,
  ): Promise<Genre[]> {
    const genres: Genre[] = [];

    for (const tmdbGenre of tmdbGenres) {
      if (!tmdbGenre.name?.trim()) continue;
      let genre = await this.genreRepository.findByNameOrEnName(
        tmdbGenre.name,
        tmdbGenre.name,
      );
      if (!genre) {
        genre = await this.genreRepository.create({
          name: tmdbGenre.name,
          enName: tmdbGenre.name,
        });
      }
      genres.push(genre);
    }

    return genres;
  }

  private async resolveCountries(
    originCountry: string | null,
  ): Promise<Country[]> {
    if (!originCountry) return [];
    const country = await this.countryRepository.findByCode(originCountry);
    return country ? [country] : [];
  }

  private toTmdbAppException(error: unknown, action: string): AppException {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        return new AppException(
          HttpStatus.BAD_GATEWAY,
          'TMDB xác thực không thành công',
          `TMDB auth failed while ${action}`,
          'TMDB_AUTH_FAILED',
        );
      }
      if (status === 429) {
        return new AppException(
          HttpStatus.TOO_MANY_REQUESTS,
          'TMDB đang giới hạn yêu cầu, vui lòng thử lại sau',
          `TMDB rate limit while ${action}`,
          'TMDB_RATE_LIMIT',
        );
      }
    }

    return new AppException(
      HttpStatus.BAD_GATEWAY,
      'Không thể lấy dữ liệu phim từ TMDB',
      `TMDB request failed while ${action}`,
      'TMDB_REQUEST_FAILED',
    );
  }
}
