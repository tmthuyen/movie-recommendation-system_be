import { HttpStatus } from '@nestjs/common';

import { FailedEventsController } from './failed-events.controller';
import { FailedEventsService } from './failed-events.service';

describe('FailedEventsController', () => {
  let controller: FailedEventsController;
  let service: { findAll: jest.Mock; retry: jest.Mock };

  beforeEach(() => {
    service = { findAll: jest.fn(), retry: jest.fn() };
    controller = new FailedEventsController(
      service as unknown as FailedEventsService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findAll', () => {
    it('mặc định page=1, limit=10 và map envelope + pagination', async () => {
      const data = [{ id: 'fe-1' }];
      service.findAll.mockResolvedValue({
        data,
        total: 25,
        page: 1,
        limit: 10,
        totalPages: 3,
      });

      const response = await controller.findAll({});

      expect(service.findAll).toHaveBeenCalledWith(1, 10, undefined);
      expect(response).toEqual({
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Lấy danh sách failed events thành công',
        result: data,
        pagination: { total: 25, page: 1, limit: 10, totalPages: 3 },
      });
    });

    it('truyền page/limit/status từ query xuống service', async () => {
      service.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 2,
        limit: 5,
        totalPages: 0,
      });

      await controller.findAll({ page: 2, limit: 5 }, 'PENDING');

      expect(service.findAll).toHaveBeenCalledWith(2, 5, 'PENDING');
    });

    it('page/limit = 0 hoặc âm → fallback về 1/10 (toán tử ||)', async () => {
      service.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      await controller.findAll({ page: 0, limit: 0 });

      expect(service.findAll).toHaveBeenCalledWith(1, 10, undefined);
    });

    it('service lỗi → lỗi lan ra ngoài (filter toàn cục xử lý)', async () => {
      service.findAll.mockRejectedValue(new Error('db down'));

      await expect(controller.findAll({})).rejects.toThrow('db down');
    });
  });

  describe('retry', () => {
    it('retry thành công → success=true, message thành công', async () => {
      service.retry.mockResolvedValue(true);

      const response = await controller.retry('fe-1');

      expect(service.retry).toHaveBeenCalledWith('fe-1');
      expect(response).toEqual({
        success: true,
        statusCode: HttpStatus.OK,
        message: 'Retry thành công, message đã vào Queue',
      });
    });

    it('retry thất bại → success=false, message thất bại', async () => {
      service.retry.mockResolvedValue(false);

      const response = await controller.retry('fe-1');

      expect(response).toEqual({
        success: false,
        statusCode: HttpStatus.OK,
        message: 'Retry thất bại',
      });
    });

    it('id không tồn tại (service ném NotFound) → lỗi lan ra ngoài', async () => {
      service.retry.mockRejectedValue(new Error('Không tìm thấy failed event'));

      await expect(controller.retry('missing')).rejects.toThrow(
        'Không tìm thấy failed event',
      );
    });
  });
});
