import { HttpStatus } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';

describe('DashboardController', () => {
  let controller: DashboardController;
  let service: { getStats: jest.Mock };

  beforeEach(() => {
    service = { getStats: jest.fn() };
    controller = new DashboardController(
      service as unknown as DashboardService,
    );
  });

  it('stats có JwtAuthGuard + RolesGuard và chỉ cho ADMIN/SUPERADMIN', () => {
    const guards = Reflect.getMetadata(
      '__guards__',
      DashboardController,
    ) as Array<new (...args: never[]) => unknown>;
    expect(guards).toEqual(expect.arrayContaining([JwtAuthGuard, RolesGuard]));
    const handler = Object.getOwnPropertyDescriptor(
      DashboardController.prototype,
      'getStats',
    )?.value as (...args: never[]) => unknown;
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      'ADMIN',
      'SUPERADMIN',
    ]);
  });

  it('trả envelope chuẩn với result từ service', async () => {
    const stats = {
      totals: {
        movies: 1,
        users: 1,
        genres: 1,
        interactions: 1,
        ratings: 1,
        comments: 1,
      },
      period: { period: 'day', from: 'a', to: 'b' },
    };
    const query = { period: 'day' as const };
    service.getStats.mockResolvedValue(stats);

    const response = await controller.getStats(query);

    expect(service.getStats).toHaveBeenCalledWith(query);
    expect(response).toEqual({
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy thống kê dashboard thành công',
      result: stats,
    });
  });

  it('lỗi validate từ service lan ra ngoài', async () => {
    service.getStats.mockRejectedValue(
      new Error('from phải nhỏ hơn hoặc bằng to'),
    );
    await expect(controller.getStats({ period: 'custom' })).rejects.toThrow(
      'from phải nhỏ hơn hoặc bằng to',
    );
  });
});
