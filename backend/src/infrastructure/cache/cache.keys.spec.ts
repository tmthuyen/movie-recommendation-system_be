import { CacheKeys } from './cache.keys';
import { RecommendationSnapshotSchema } from './cache.schemas';

describe('CacheKeys', () => {
  it('mß╗ìi key ─æß╗üu bß║»t ─æß║ºu bß║▒ng "cache:"', () => {
    const keys = [
      CacheKeys.movie.detail(1),
      CacheKeys.movie.list(0, 1, 10),
      CacheKeys.movie.search(2, 1, 10, { keyword: 'a' }),
      CacheKeys.genre.list(0, 1, 100),
      CacheKeys.country.list(0, 1, 100),
      CacheKeys.interaction.stats(1),
      CacheKeys.recommendation.similar(1, 100, 3),
      CacheKeys.movie.listVersion(),
      CacheKeys.recommendation.similarVersion(1),
    ];

    keys.forEach(key => expect(key.startsWith('cache:')).toBe(true));
  });

  it('─æß║úo thß╗⌐ tß╗▒ filter cho c├╣ng key (hash ß╗òn ─æß╗ïnh)', () => {
    const a = CacheKeys.movie.search(1, 1, 10, {
      keyword: 'abc',
      sort: 'id:ASC',
    });
    const b = CacheKeys.movie.search(1, 1, 10, {
      sort: 'id:ASC',
      keyword: 'abc',
    });

    expect(a).toBe(b);
  });

  it('giß╗» page/limit ─æß╗ìc ─æ╞░ß╗úc, filter kh├íc ΓåÆ key kh├íc', () => {
    expect(CacheKeys.movie.list(1, 2, 20)).toBe('cache:movie:list:v1:p2:l20');

    const first = CacheKeys.movie.list(1, 1, 20, { keyword: 'a' });
    const second = CacheKeys.movie.list(1, 1, 20, { keyword: 'b' });
    expect(first).not.toBe(second);
  });

  it('version kh├íc ΓåÆ key recommendation kh├íc', () => {
    expect(CacheKeys.recommendation.similar(1, 100, 1)).not.toBe(
      CacheKeys.recommendation.similar(1, 100, 2),
    );
    expect(CacheKeys.recommendation.similar(1, 100, 1)).toBe(
      'cache:recommendation:similar:1:k100:v1',
    );
  });
});

describe('RecommendationSnapshotSchema', () => {
  it('chß║Ñp nhß║¡n snapshot hß╗úp lß╗ç (rank 1..n)', () => {
    expect(() =>
      RecommendationSnapshotSchema.parse([
        { id: 2, score: 0.9, rank: 1 },
        { id: 5, score: 0.8, rank: 2 },
      ]),
    ).not.toThrow();
  });

  it('reject id tr├╣ng', () => {
    expect(() =>
      RecommendationSnapshotSchema.parse([
        { id: 2, score: 0.9, rank: 1 },
        { id: 2, score: 0.8, rank: 2 },
      ]),
    ).toThrow();
  });

  it('reject rank lß╗çch', () => {
    expect(() =>
      RecommendationSnapshotSchema.parse([
        { id: 2, score: 0.9, rank: 1 },
        { id: 5, score: 0.8, rank: 5 },
      ]),
    ).toThrow();
  });

  it('reject score ngo├ái [0,1]', () => {
    expect(() =>
      RecommendationSnapshotSchema.parse([{ id: 2, score: 1.5, rank: 1 }]),
    ).toThrow();
  });
});
