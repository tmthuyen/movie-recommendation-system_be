import { Controller, Get, HttpStatus, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { DashboardService } from './dashboard.service';
import { DashboardStatsQueryDto } from './dtos/dashboard-stats-query.dto';

@ApiTags('Dashboard (Admin)')
@ApiBearerAuth()
@Controller('admin/dashboard')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Roles('ADMIN', 'SUPERADMIN')
  @Get('stats')
  @ApiOperation({
    summary: 'Thống kê dashboard theo kỳ hoặc khoảng thời gian tuỳ chỉnh (UTC)',
  })
  async getStats(@Query() query: DashboardStatsQueryDto) {
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy thống kê dashboard thành công',
      result: await this.dashboardService.getStats(query),
    };
  }
}
