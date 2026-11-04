import { describe, expect, it } from 'vitest';
import { keysToCamel, snakeToCamel } from './snakeToCamel';

describe('snakeToCamel', () => {
  it('chuyển snake_case sang camelCase', () => {
    expect(snakeToCamel('movie_id')).toBe('movieId');
    expect(snakeToCamel('created_at')).toBe('createdAt');
    expect(snakeToCamel('avatar_url')).toBe('avatarUrl');
  });

  it('chuyển kebab-case sang camelCase', () => {
    expect(snakeToCamel('release-date')).toBe('releaseDate');
    expect(snakeToCamel('top-rated-movies')).toBe('topRatedMovies');
  });

  it('giữ nguyên chuỗi đã là camelCase hoặc chỉ có một từ', () => {
    expect(snakeToCamel('titleVi')).toBe('titleVi');
    expect(snakeToCamel('total')).toBe('total');
    expect(snakeToCamel('')).toBe('');
  });

  it('xử lý nhiều dấu phân cách liên tiếp trong cùng một chuỗi', () => {
    expect(snakeToCamel('is_ai_translated_flag')).toBe('isAiTranslatedFlag');
    expect(snakeToCamel('a_b-c_d')).toBe('aBCD');
  });
});

describe('keysToCamel', () => {
  it('chuyển key của object phẳng', () => {
    expect(keysToCamel({ full_name: 'Nguyễn A', phone_number: '0909' })).toEqual({
      fullName: 'Nguyễn A',
      phoneNumber: '0909',
    });
  });

  it('chuyển key lồng nhau (object trong object)', () => {
    const input = {
      movie_id: 1,
      movie_detail: { release_date: '2024-01-01', country: { vi_name: 'Việt Nam' } },
    };

    expect(keysToCamel(input)).toEqual({
      movieId: 1,
      movieDetail: { releaseDate: '2024-01-01', country: { viName: 'Việt Nam' } },
    });
  });

  it('duyệt đệ quy qua mảng object', () => {
    expect(
      keysToCamel({
        result: [
          { user_id: 'u1', is_verified: true },
          { user_id: 'u2', is_verified: false },
        ],
      }),
    ).toEqual({
      result: [
        { userId: 'u1', isVerified: true },
        { userId: 'u2', isVerified: false },
      ],
    });
  });

  it('giữ nguyên giá trị primitive và null', () => {
    expect(keysToCamel(42)).toBe(42);
    expect(keysToCamel('movie_id')).toBe('movie_id');
    expect(keysToCamel(null)).toBeNull();
    expect(keysToCamel(undefined)).toBeUndefined();
    expect(keysToCamel(true)).toBe(true);
  });

  it('xử lý mảng primitive', () => {
    expect(keysToCamel([1, 'a', null])).toEqual([1, 'a', null]);
  });
});
