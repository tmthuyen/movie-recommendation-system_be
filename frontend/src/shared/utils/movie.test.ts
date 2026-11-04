import { describe, expect, it } from 'vitest';
import {
  getBackdropUrl,
  getMovieTitle,
  getPosterUrl,
  getReleaseYear,
  getTmdbImageUrl,
  movieUtil,
} from './movie';

describe('getTmdbImageUrl', () => {
  it('dựng URL TMDB mặc định với size w500', () => {
    expect(getTmdbImageUrl('/poster.jpg')).toBe(
      'https://image.tmdb.org/t/p/w500/poster.jpg',
    );
  });

  it('cho phép chọn size khác (w780, original)', () => {
    expect(getTmdbImageUrl('/backdrop.jpg', 'w780')).toBe(
      'https://image.tmdb.org/t/p/w780/backdrop.jpg',
    );
    expect(getTmdbImageUrl('/backdrop.jpg', 'original')).toBe(
      'https://image.tmdb.org/t/p/original/backdrop.jpg',
    );
  });

  it('trả null khi path rỗng hoặc không tồn tại', () => {
    expect(getTmdbImageUrl(undefined)).toBeNull();
    expect(getTmdbImageUrl(null)).toBeNull();
    expect(getTmdbImageUrl('')).toBeNull();
  });
});

describe('getPosterUrl / getBackdropUrl', () => {
  it('poster dùng size w500, backdrop dùng size w780', () => {
    expect(getPosterUrl('/p.jpg')).toContain('/w500/p.jpg');
    expect(getBackdropUrl('/b.jpg')).toContain('/w780/b.jpg');
  });

  it('không có path → null', () => {
    expect(getPosterUrl()).toBeNull();
    expect(getBackdropUrl(null)).toBeNull();
  });
});

describe('getMovieTitle', () => {
  it('ưu tiên tiêu đề tiếng Việt', () => {
    expect(getMovieTitle({ titleVi: 'Dune: Hành Tinh Cát', title: 'Dune' })).toBe(
      'Dune: Hành Tinh Cát',
    );
  });

  it('fallback sang tiêu đề gốc khi thiếu titleVi', () => {
    expect(getMovieTitle({ titleVi: '', title: 'Dune' })).toBe('Dune');
    expect(getMovieTitle({ title: 'Dune' })).toBe('Dune');
  });

  it('trả nhãn mặc định khi không có cả hai tiêu đề', () => {
    expect(getMovieTitle({})).toBe('Chưa có tiêu đề');
  });
});

describe('getReleaseYear', () => {
  it('lấy 4 ký tự đầu của releaseDate', () => {
    expect(getReleaseYear('2024-03-01')).toBe('2024');
  });

  it('trả chuỗi rỗng khi không có ngày phát hành', () => {
    expect(getReleaseYear()).toBe('');
    expect(getReleaseYear(null)).toBe('');
    expect(getReleaseYear('')).toBe('');
  });
});

describe('movieUtil', () => {
  it('export đầy đủ các helper', () => {
    expect(movieUtil.getMovieTitle).toBe(getMovieTitle);
    expect(movieUtil.getPosterUrl).toBe(getPosterUrl);
    expect(movieUtil.getReleaseYear).toBe(getReleaseYear);
  });
});
