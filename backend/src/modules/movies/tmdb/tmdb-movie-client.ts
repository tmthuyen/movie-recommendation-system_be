import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  TmdbDiscoverMovie,
  TmdbGenreListResponse,
  TmdbGenreOption,
  TmdbMovieDetail,
  TmdbRawLanguageOption,
} from './tmdb-movie.types';

interface TmdbDiscoverResponse {
  page: number;
  total_pages: number;
  total_results: number;
  results: TmdbDiscoverMovie[];
}

@Injectable()
export class TmdbMovieClient {
  private readonly logger = new Logger(TmdbMovieClient.name);
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly useBearerAuth: boolean;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl =
      this.configService.get<string>('TMDB_API_BASE_URL') ||
      'https://api.themoviedb.org/3';
    this.token = this.configService.get<string>('TMDB_API_TOKEN') || '';
    // Token dạng JWT (có dấu '.') dùng Bearer; API key v3 thì dùng query `api_key`.
    // Không gửi cả hai cùng lúc để tránh TMDB trả 401.
    this.useBearerAuth = this.token.split('.').length === 3;
    this.timeout =
      this.configService.get<number>('TMDB_HTTP_TIMEOUT_MS') || 10000;
  }

  private headers(): Record<string, string> | undefined {
    if (!this.token || !this.useBearerAuth) return undefined;
    return { Authorization: `Bearer ${this.token}` };
  }

  private authParams(
    params: Record<string, string | number>,
  ): Record<string, string | number> {
    if (!this.token || this.useBearerAuth) return params;
    return { ...params, api_key: this.token };
  }

  async discover(
    params: Record<string, string | number>,
  ): Promise<TmdbDiscoverResponse> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<TmdbDiscoverResponse>(
          `${this.baseUrl}/discover/movie`,
          {
            headers: this.headers(),
            timeout: this.timeout,
            params: this.authParams(params),
          },
        ),
      );
      return data;
    } catch (error) {
      this.logHttpError('/discover/movie', error);
      throw error;
    }
  }

  async getDetail(
    tmdbId: number,
    language: 'en-US' | 'vi-VN',
  ): Promise<TmdbMovieDetail> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<TmdbMovieDetail>(
          `${this.baseUrl}/movie/${tmdbId}`,
          {
            headers: this.headers(),
            timeout: this.timeout,
            params: this.authParams({ language }),
          },
        ),
      );
      return data;
    } catch (error) {
      this.logHttpError(`/movie/${tmdbId}`, error);
      throw error;
    }
  }

  async getGenres(language = 'vi-VN'): Promise<TmdbGenreOption[]> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<TmdbGenreListResponse>(
          `${this.baseUrl}/genre/movie/list`,
          {
            headers: this.headers(),
            timeout: this.timeout,
            params: this.authParams({ language }),
          },
        ),
      );
      return data?.genres ?? [];
    } catch (error) {
      this.logHttpError('/genre/movie/list', error);
      throw error;
    }
  }

  async getLanguages(): Promise<TmdbRawLanguageOption[]> {
    try {
      const { data } = await firstValueFrom(
        this.httpService.get<TmdbRawLanguageOption[]>(
          `${this.baseUrl}/configuration/languages`,
          {
            headers: this.headers(),
            timeout: this.timeout,
            params: this.authParams({}),
          },
        ),
      );
      return data ?? [];
    } catch (error) {
      this.logHttpError('/configuration/languages', error);
      throw error;
    }
  }

  private logHttpError(path: string, error: unknown): void {
    const status =
      error instanceof AxiosError ? error.response?.status : undefined;
    this.logger.warn(
      `TMDB request thất bại: path=${path}, status=${status || 'unknown'}`,
    );
  }
}
