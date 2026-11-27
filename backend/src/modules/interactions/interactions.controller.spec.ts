import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';

describe('InteractionsController', () => {
  let controller: InteractionsController;
  let service: {
    findAll: jest.Mock;
    getHistory: jest.Mock;
    getFavorites: jest.Mock;
    getMyActivities: jest.Mock;
    getMovieRanking: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      getHistory: jest.fn(),
      getFavorites: jest.fn(),
      getMyActivities: jest.fn(),
      getMovieRanking: jest.fn().mockResolvedValue([{ movieId: 3, score: 9 }]),
      remove: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [InteractionsController],
      providers: [{ provide: InteractionsService, useValue: service }],
    }).compile();

    controller = module.get<InteractionsController>(InteractionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  const pagination = { total: 0, page: 1, limit: 10, totalPages: 0 };

  describe('findAll', () => {
    it('trả envelope + pagination', async () => {
      service.findAll.mockResolvedValue({ result: [{ id: 1 }], pagination });

      const response = await controller.findAll({
        keyword: 'phim',
        filters: ['type:eq:like'],
      });

      expect(service.findAll).toHaveBeenCalledWith({
        keyword: 'phim',
        filters: ['type:eq:like'],
      });
      expect(response.result).toEqual([{ id: 1 }]);
      expect(response.pagination).toEqual(pagination);
    });
  });

  describe('my lists', () => {
    it('getMyHistory lấy userId từ token', async () => {
      service.getHistory.mockResolvedValue({ result: [], pagination });
      const req = { user: { sub: 'user-1' } } as never;

      const response = await controller.getMyHistory(req, {
        sort: ['createdAt:DESC'],
      });

      expect(service.getHistory).toHaveBeenCalledWith('user-1', {
        sort: ['createdAt:DESC'],
      });
      expect(response.success).toBe(true);
    });

    it('getMyFavorites lấy userId từ token', async () => {
      service.getFavorites.mockResolvedValue({ result: [], pagination });
      const req = { user: { sub: 'user-1' } } as never;

      await controller.getMyFavorites(req, { page: 2, limit: 5 });

      expect(service.getFavorites).toHaveBeenCalledWith('user-1', {
        page: 2,
        limit: 5,
      });
    });

    it('getMyActivities lấy userId từ token, truyền types/page/limit xuống service', async () => {
      service.getMyActivities.mockResolvedValue({ result: [], pagination });
      const req = { user: { sub: 'user-1' } } as never;
      const query = {
        types: ['click' as never, 'comment' as never],
        page: 2,
        limit: 5,
      };

      const response = await controller.getMyActivities(req, query);

      expect(service.getMyActivities).toHaveBeenCalledWith('user-1', query);
      expect(response).toEqual({
        success: true,
        statusCode: 200,
        message: 'Lấy lịch sử tương tác thành công',
        result: [],
        pagination,
      });
    });

    it('remove truyền userId từ token xuống service để kiểm tra chủ sở hữu', async () => {
      service.remove.mockResolvedValue({ success: true });
      const req = { user: { sub: 'user-1' } } as never;

      const response = await controller.remove(req, '7');

      expect(service.remove).toHaveBeenCalledWith(7, 'user-1');
      expect(response.result).toEqual({ success: true });
    });
  });

  describe('xếp hạng hot/popular/top', () => {
    it('popular dùng period all và trả envelope có pagination', async () => {
      const response = await controller.getPopular('5');

      expect(service.getMovieRanking).toHaveBeenCalledWith(
        'popular',
        'all',
        'all',
        5,
      );
      expect(response.result).toEqual([{ movieId: 3, score: 9 }]);
      expect(response.pagination).toEqual({
        total: 1,
        page: 1,
        limit: 5,
        totalPages: 1,
      });
    });

    it('hot nhận period day/week/month', async () => {
      await controller.getHot('week', '10');
      expect(service.getMovieRanking).toHaveBeenCalledWith(
        'hot',
        'week',
        'week',
        10,
      );
    });

    it('top nhận metric + period', async () => {
      await controller.getTop('rating', 'month', '20');
      expect(service.getMovieRanking).toHaveBeenCalledWith(
        'top',
        'rating',
        'month',
        20,
      );
    });

    it('từ chối metric/period/limit sai', async () => {
      await expect(controller.getPopular('0')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.getHot('all')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(controller.getTop('like', 'nope')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
