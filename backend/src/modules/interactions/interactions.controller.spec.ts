import { Test, TestingModule } from '@nestjs/testing';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';

describe('InteractionsController', () => {
  let controller: InteractionsController;
  let service: {
    findAll: jest.Mock;
    getHistory: jest.Mock;
    getFavorites: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      getHistory: jest.fn(),
      getFavorites: jest.fn(),
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
  });
});
