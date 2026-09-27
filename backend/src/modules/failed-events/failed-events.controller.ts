import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { FailedEventsService } from './failed-events.service';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { Roles } from '@/common/decorators/roles.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Failed Events (Admin)')
@Controller('failed-events')
export class FailedEventsController {
  constructor(private readonly failedEventsService: FailedEventsService) {}

  @Roles('ADMIN', 'SUPERADMIN')
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách các message lỗi (Dead Letter)' })
  async findAll(
    @Query() query: PaginationDto,
    @Query('status') status?: string,
  ) {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const result = await this.failedEventsService.findAll(page, limit, status);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách failed events thành công',
      result: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  @Roles('ADMIN', 'SUPERADMIN')
  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry thủ công một message bị rớt' })
  async retry(@Param('id') id: string) {
    const isSuccess = await this.failedEventsService.retry(id);
    return {
      success: isSuccess,
      statusCode: HttpStatus.OK,
      message: isSuccess
        ? 'Retry thành công, message đã vào Queue'
        : 'Retry thất bại',
    };
  }
}
