import { describe, expect, it } from 'vitest';
import { Comment } from '@/shared/types/comment.types';
import { Interaction } from '@/shared/types/interaction.types';
import { Movie } from '@/shared/types/movie.types';
import { Rating } from '@/shared/types/rating.types';
import {
  OTHER_LABEL,
  UNKNOWN_LABEL,
  buildCountryDistribution,
  buildDataQualityIssues,
  buildGenreDistribution,
  buildInteractionTypeDistribution,
  buildRatingDistribution,
  buildRecentActivity,
  buildTopActiveUsers,
  buildTopMoviesByViews,
  buildTopRatedMovies,
  filterWithinDays,
  formatActivityTime,
  toCsv,
  toTopWithOther,
} from './admin-dashboard';

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                    */
/* -------------------------------------------------------------------------- */

const baseDto = {
  createdAt: new Date('2024-01-01T00:00:00Z'),
  createdBy: 'system',
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  updatedBy: 'system',
};

const movie = (overrides: Partial<Movie> & { id: number }): Movie => ({
  ...baseDto,
  title: `Movie ${overrides.id}`,
  ...overrides,
});

const interaction = (overrides: Partial<Interaction> & { id: number }): Interaction => ({
  ...baseDto,
  score: 5,
  type: 'click',
  ...overrides,
});

const rating = (overrides: Partial<Rating> & { id: number }): Rating =>
  ({
    ...baseDto,
    rating: 5,
    ...overrides,
  }) as Rating;

const comment = (overrides: Partial<Comment> & { id: number }): Comment =>
  ({
    ...baseDto,
    content: 'Hay quá',
    ...overrides,
  }) as Comment;

/* -------------------------------------------------------------------------- */
/* toTopWithOther                                                              */
/* -------------------------------------------------------------------------- */

describe('toTopWithOther', () => {
  it('lấy top N giảm dần và gộp phần còn lại vào "Khác"', () => {
    const counts = new Map([
      ['A', 5],
      ['B', 3],
      ['C', 2],
      ['D', 1],
    ]);

    expect(toTopWithOther(counts, 2)).toEqual([
      { label: 'A', value: 5 },
      { label: 'B', value: 3 },
      { label: OTHER_LABEL, value: 3 },
    ]);
  });

  it('không thêm "Khác" khi số nhóm ≤ limit', () => {
    const counts = new Map([
      ['A', 2],
      ['B', 1],
    ]);

    expect(toTopWithOther(counts, 10)).toEqual([
      { label: 'A', value: 2 },
      { label: 'B', value: 1 },
    ]);
  });

  it('trả mảng rỗng với Map rỗng', () => {
    expect(toTopWithOther(new Map(), 5)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* Distributions                                                               */
/* -------------------------------------------------------------------------- */

describe('buildTopMoviesByViews', () => {
  it('sắp xếp theo lượt xem giảm dần, ép Number và cắt theo limit', () => {
    const movies = [
      movie({ id: 1, titleVi: 'A', viewCount: 10 }),
      movie({ id: 2, titleVi: 'B', viewCount: '250' as unknown as number }),
      movie({ id: 3, titleVi: 'C', viewCount: undefined }),
    ];

    expect(buildTopMoviesByViews(movies, 2)).toEqual([
      { label: 'B', value: 250 },
      { label: 'A', value: 10 },
    ]);
  });

  it('không mutate mảng gốc', () => {
    const movies = [movie({ id: 1, viewCount: 1 }), movie({ id: 2, viewCount: 9 })];
    const snapshot = movies.map((item) => item.id);

    buildTopMoviesByViews(movies, 10);

    expect(movies.map((item) => item.id)).toEqual(snapshot);
  });
});

describe('buildGenreDistribution', () => {
  it('đếm mỗi thể loại một lần cho mỗi phim', () => {
    const movies = [
      movie({
        id: 1,
        genres: [
          { id: 'g1', name: 'Hành động' },
          { id: 'g2', name: 'Kinh dị' },
        ],
      }),
      movie({ id: 2, genres: [{ id: 'g1', name: 'Hành động' }] }),
      movie({ id: 3, genres: [] }),
    ];

    expect(buildGenreDistribution(movies)).toEqual([
      { label: 'Hành động', value: 2 },
      { label: 'Kinh dị', value: 1 },
    ]);
  });
});

describe('buildCountryDistribution', () => {
  it('gán nhãn "Chưa xác định" cho phim thiếu quốc gia', () => {
    const movies = [
      movie({ id: 1, country: { viName: 'Việt Nam' } as Movie['country'] }),
      movie({ id: 2, country: { viName: 'Việt Nam' } as Movie['country'] }),
      movie({ id: 3 }),
    ];

    expect(buildCountryDistribution(movies)).toEqual([
      { label: 'Việt Nam', value: 2 },
      { label: UNKNOWN_LABEL, value: 1 },
    ]);
  });
});

describe('buildInteractionTypeDistribution', () => {
  it('nhóm theo loại và sắp xếp giảm dần', () => {
    const interactions = [
      interaction({ id: 1, type: 'click' }),
      interaction({ id: 2, type: 'click' }),
      interaction({ id: 3, type: 'like' }),
    ];

    expect(buildInteractionTypeDistribution(interactions)).toEqual([
      { type: 'click', value: 2 },
      { type: 'like', value: 1 },
    ]);
  });
});

describe('buildRatingDistribution', () => {
  it('luôn trả đủ 5 cột 1..5 và thêm cột 0 sao khi có', () => {
    const ratings = [
      rating({ id: 1, rating: 5 }),
      rating({ id: 2, rating: 5 }),
      rating({ id: 3, rating: 4 }),
      rating({ id: 4, rating: 0 }),
    ];

    expect(buildRatingDistribution(ratings)).toEqual([
      { label: '0 sao', value: 1 },
      { label: '1 sao', value: 0 },
      { label: '2 sao', value: 0 },
      { label: '3 sao', value: 0 },
      { label: '4 sao', value: 1 },
      { label: '5 sao', value: 2 },
    ]);
  });
});

describe('buildTopRatedMovies', () => {
  it('tính điểm trung bình, lọc theo minVotes và cắt limit', () => {
    const ratings = [
      rating({ id: 1, rating: 5, movie: movie({ id: 1, titleVi: 'A' }) }),
      rating({ id: 2, rating: 3, movie: movie({ id: 1, titleVi: 'A' }) }),
      rating({ id: 3, rating: 4, movie: movie({ id: 2, titleVi: 'B' }) }),
    ];

    expect(buildTopRatedMovies(ratings, 10, 2)).toEqual([
      { label: 'A', value: 4, votes: 2 },
    ]);
  });

  it('bỏ qua rating không join được movie', () => {
    const ratings = [rating({ id: 1, rating: 5 })];

    expect(buildTopRatedMovies(ratings, 10, 1)).toEqual([]);
  });
});

describe('buildTopActiveUsers', () => {
  it('gộp theo tên user, fallback email, bỏ record không có user', () => {
    const records = [
      { user: { id: 'u1', fullName: 'An' } },
      { user: { id: 'u1', fullName: 'An' } },
      { user: { id: 'u2', email: 'binh@example.com' } },
      { user: undefined },
    ];

    expect(buildTopActiveUsers(records)).toEqual([
      { label: 'An', value: 2 },
      { label: 'binh@example.com', value: 1 },
    ]);
  });
});

/* -------------------------------------------------------------------------- */
/* Data quality / thời gian / CSV                                              */
/* -------------------------------------------------------------------------- */

describe('buildDataQualityIssues', () => {
  it('đếm đúng từng loại dữ liệu thiếu', () => {
    const movies = [
      movie({ id: 1, posterPath: '/p.jpg', overview: 'x', genres: [{ id: 'g', name: 'G' }], country: {} as Movie['country'] }),
      movie({ id: 2 }),
    ];

    const issues = buildDataQualityIssues(movies);
    const byLabel = Object.fromEntries(issues.map((issue) => [issue.label, issue.count]));

    expect(byLabel['Thiếu poster']).toBe(1);
    expect(byLabel['Thiếu mô tả']).toBe(1);
    expect(byLabel['Chưa gắn thể loại']).toBe(1);
    expect(byLabel['Chưa gắn quốc gia']).toBe(1);
    expect(issues.every((issue) => issue.href === '/admin/movies')).toBe(true);
  });
});

describe('filterWithinDays', () => {
  it('days = 0 trả nguyên mảng', () => {
    const items = [{ createdAt: '2020-01-01' }];
    expect(filterWithinDays(items, 0)).toBe(items);
  });

  it('lọc theo ngưỡng thời gian và loại record thiếu createdAt', () => {
    const recent = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const items = [
      { createdAt: recent },
      { createdAt: old },
      { createdAt: undefined },
    ];

    expect(filterWithinDays(items, 7)).toEqual([{ createdAt: recent }]);
  });
});

describe('buildRecentActivity', () => {
  it('gộp 3 loại, sắp mới nhất trước và cắt limit', () => {
    const items = buildRecentActivity({
      interactions: [
        interaction({
          id: 1,
          type: 'like',
          createdAt: new Date('2024-03-01T10:00:00Z'),
          user: { id: 'u1', fullName: 'An' },
          movie: movie({ id: 1, titleVi: 'Phim A' }),
        }),
      ],
      ratings: [
        rating({
          id: 2,
          rating: 4,
          createdAt: '2024-03-03T10:00:00Z',
          user: { id: 'u2', email: 'binh@example.com' },
          movie: movie({ id: 2, titleVi: 'Phim B' }),
        }),
      ],
      comments: [
        comment({
          id: 3,
          content: 'Tuyệt',
          createdAt: '2024-03-02T10:00:00Z',
          user: { id: 'u3', fullName: 'Chi' },
          movie: movie({ id: 3, titleVi: 'Phim C' }),
        }),
      ],
      limit: 2,
    });

    expect(items.map((item) => item.kind)).toEqual(['rating', 'comment']);
    expect(items[0]).toMatchObject({
      id: 'rating-2',
      userName: 'binh@example.com',
      movieTitle: 'Phim B',
      detail: '4 sao',
      kindLabel: 'Đánh giá',
    });
    expect(items[1].detail).toBe('Tuyệt');
  });
});

describe('formatActivityTime', () => {
  it('định dạng thời gian, fallback "—" khi thiếu', () => {
    expect(formatActivityTime('2024-01-05T03:07:09')).toBe('05-01-2024 03:07:09');
    expect(formatActivityTime()).toBe('—');
  });
});

describe('toCsv', () => {
  it('trả chuỗi rỗng với mảng rỗng', () => {
    expect(toCsv([])).toBe('');
  });

  it('tạo header + dòng, escape dấu " và xuống dòng CRLF', () => {
    const csv = toCsv([
      { name: 'An', note: 'a,b' },
      { name: 'Bình "B"', note: 'ok' },
    ]);

    expect(csv).toBe('"name","note"\r\n"An","a,b"\r\n"Bình ""B""","ok"');
  });
});
