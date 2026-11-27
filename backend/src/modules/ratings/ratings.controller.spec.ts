import { Test, TestingModule } from '@nestjs/testing';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';

describe('RatingsController', () => {
  let controller: RatingsController;
  let service: {
    findAll: jest.Mock;
    findByMovie: jest.Mock;
    update: jest.Mock;
  };

  beforeEach(async () => {
    service = { findAll: jest.fn(), findByMovie: jest.fn(), update: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RatingsController],
      providers: [{ provide: RatingsService, useValue: service }],
    }).compile();

    controller = module.get<RatingsController>(RatingsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('trả envelope + pagination', async () => {
      service.findAll.mockResolvedValue({
        result: [{ id: 1 }],
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });

      const response = await controller.findAll({
        keyword: 'hay',
        filters: ['rating:gte:4'],
        sort: ['rating:DESC'],
      });

      expect(service.findAll).toHaveBeenCalledWith({
        keyword: 'hay',
        filters: ['rating:gte:4'],
        sort: ['rating:DESC'],
      });
      expect(response.success).toBe(true);
      expect(response.result).toEqual([{ id: 1 }]);
      expect(response.pagination).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });
  });

  describe('findByMovie', () => {
    it('truyền movieId dạng number + search request', async () => {
      service.findByMovie.mockResolvedValue({
        result: [],
        pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
      });

      await controller.findByMovie('7', { page: 2, limit: 5 });

      expect(service.findByMovie).toHaveBeenCalledWith(7, {
        page: 2,
        limit: 5,
      });
    });
  });

  describe('update', () => {
    it('truyền userId từ JWT xuống service để kiểm tra chủ sở hữu', async () => {
      service.update.mockResolvedValue({ id: 3, rating: 5 });
      const req = { user: { sub: 'user-1' } } as never;

      const response = await controller.update(req, '3', { rating: 5 });

      expect(service.update).toHaveBeenCalledWith(3, 'user-1', { rating: 5 });
      expect(response.result).toEqual({ id: 3, rating: 5 });
    });
  });
});
