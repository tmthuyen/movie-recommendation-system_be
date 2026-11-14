import { Test, TestingModule } from '@nestjs/testing';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

describe('CommentsController', () => {
  let controller: CommentsController;
  let service: { findAll: jest.Mock; findByMovie: jest.Mock };

  beforeEach(async () => {
    service = { findAll: jest.fn(), findByMovie: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentsController],
      providers: [{ provide: CommentsService, useValue: service }],
    }).compile();

    controller = module.get<CommentsController>(CommentsController);
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
        sort: ['createdAt:DESC'],
      });

      expect(service.findAll).toHaveBeenCalledWith({
        keyword: 'hay',
        sort: ['createdAt:DESC'],
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
    it('truyền movieId dạng number + parentId', async () => {
      service.findByMovie.mockResolvedValue({
        result: [],
        pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
      });

      await controller.findByMovie('7', { page: 1, limit: 10, parentId: 2 });

      expect(service.findByMovie).toHaveBeenCalledWith(
        7,
        { page: 1, limit: 10, parentId: 2 },
        2,
      );
    });
  });
});
