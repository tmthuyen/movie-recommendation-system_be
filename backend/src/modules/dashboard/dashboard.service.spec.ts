import { BadRequestException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { IDashboardRepository } from './dashboard.repository';
import type {
  DashboardDateRange,
  DashboardStats,
} from './dashboard.interfaces';

describe('DashboardService', () => {
  let service: DashboardService;
  let repo: Record<string, jest.Mock>;

  const emptyStats = {
    totals: {
      movies: 0,
      users: 0,
      genres: 0,
      interactions: 0,
      ratings: 0,
      comments: 0,
    },
    timeSeries: [],
    topViewed: [],
    topActiveUsers: [],
    genreDistribution: [],
    countryDistribution: [],
    interactionTypes: [],
    ratingDistribution: [],
    topRated: [],
    dataQualityIssues: [],
    recentActivity: [],
  };

  beforeEach(() => {
    repo = {
      getTotals: jest.fn().mockResolvedValue(emptyStats.totals),
      getTimeSeries: jest.fn().mockResolvedValue([]),
      getTopViewed: jest.fn().mockResolvedValue([]),
      getTopActiveUsers: jest.fn().mockResolvedValue([]),
      getGenreDistribution: jest.fn().mockResolvedValue([]),
      getCountryDistribution: jest.fn().mockResolvedValue([]),
      getInteractionTypes: jest.fn().mockResolvedValue([]),
      getRatingDistribution: jest.fn().mockResolvedValue([]),
      getTopRated: jest.fn().mockResolvedValue([]),
      getDataQualityIssues: jest.fn().mockResolvedValue([]),
      getRecentActivity: jest.fn().mockResolvedValue([]),
    };
    service = new DashboardService(repo as unknown as IDashboardRepository);
  });

  it('mặc định dùng period=month, kết thúc 23:59:59.999Z và trả số 0 khi DB rỗng', async () => {
    const result: DashboardStats = await service.getStats({});

    expect(result.totals).toEqual(emptyStats.totals);
    expect(result.timeSeries).toEqual([]);
    expect(result.period.period).toBe('month');
    expect(result.period.to).toMatch(/T23:59:59\.999Z$/);
    expect(Date.parse(result.period.to) - Date.parse(result.period.from)).toBe(
      30 * 86_400_000 - 1,
    );

    const range = repo.getTotals.mock.calls[0][0] as DashboardDateRange;
    expect(range.from).toBeInstanceOf(Date);
    expect(range.to).toBeInstanceOf(Date);
    expect(repo.getTimeSeries).toHaveBeenCalledWith(range);
  });

  it('custom YYYY-MM-DD → biên UTC 00:00:00.000Z và 23:59:59.999Z', async () => {
    const result = await service.getStats({
      period: 'custom',
      from: '2026-11-01',
      to: '2026-11-30',
    });

    expect(result.period).toEqual({
      period: 'custom',
      from: '2026-11-01T00:00:00.000Z',
      to: '2026-11-30T23:59:59.999Z',
    });
    expect(repo.getTotals).toHaveBeenCalledWith({
      from: new Date('2026-11-01T00:00:00.000Z'),
      to: new Date('2026-11-30T23:59:59.999Z'),
    });
  });

  it('custom ISO có offset được giữ nguyên theo UTC', async () => {
    const result = await service.getStats({
      period: 'custom',
      from: '2026-11-01T07:00:00+07:00',
      to: '2026-11-02T07:00:00+07:00',
    });

    expect(result.period.from).toBe('2026-11-01T00:00:00.000Z');
    expect(result.period.to).toBe('2026-11-02T00:00:00.000Z');
  });

  it('từ chối custom thiếu mốc hoặc from > to', async () => {
    await expect(
      service.getStats({ period: 'custom', from: '2026-11-01' }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.getStats({
        period: 'custom',
        from: '2026-11-30',
        to: '2026-11-01',
      }),
    ).rejects.toThrow('from phải nhỏ hơn hoặc bằng to');
    expect(repo.getTotals).not.toHaveBeenCalled();
  });

  it('từ chối ISO không có Z/offset và ngày không tồn tại', async () => {
    await expect(
      service.getStats({
        period: 'custom',
        from: '2026-11-01T10:00:00',
        to: '2026-11-02',
      }),
    ).rejects.toThrow('phải là YYYY-MM-DD hoặc ISO có Z/offset');
    await expect(
      service.getStats({
        period: 'custom',
        from: '2026-02-30',
        to: '2026-03-01',
      }),
    ).rejects.toThrow('Ngày from không hợp lệ');
  });

  it('giữ nguyên dữ liệu aggregate từ repository', async () => {
    const totals = {
      movies: 12,
      users: 4,
      genres: 6,
      interactions: 30,
      ratings: 8,
      comments: 5,
    };
    const timeSeries = [
      { date: '2026-11-01', interactions: 3, ratings: 1, comments: 2 },
    ];
    repo.getTotals.mockResolvedValue(totals);
    repo.getTimeSeries.mockResolvedValue(timeSeries);
    repo.getInteractionTypes.mockResolvedValue([{ type: 'click', value: 3 }]);
    repo.getRatingDistribution.mockResolvedValue([{ rating: 5, value: 1 }]);
    repo.getRecentActivity.mockResolvedValue([
      {
        id: 'rating-1',
        kind: 'rating',
        kindLabel: 'Đánh giá',
        createdAt: '2026-11-01T01:00:00.000Z',
        userName: 'User A',
        movieTitle: 'Phim A',
        detail: '5 sao',
      },
    ]);

    const result = await service.getStats({ period: 'week' });

    expect(result.totals).toEqual(totals);
    expect(result.timeSeries).toEqual(timeSeries);
    expect(result.interactionTypes).toEqual([{ type: 'click', value: 3 }]);
    expect(result.ratingDistribution).toEqual([{ rating: 5, value: 1 }]);
    expect(result.recentActivity).toHaveLength(1);
    expect(result.period.period).toBe('week');
    expect(Date.parse(result.period.to) - Date.parse(result.period.from)).toBe(
      7 * 86_400_000 - 1,
    );
  });
});
