import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  HttpStatus,
} from '@nestjs/common';
import { FailedEventsService } from './failed-events.service';
import { FailedEventSearchDto } from './dtos/failed-event-search.dto';
import { Roles } from '@/common/decorators/roles.decorator';
import { ApiTags, ApiOperation } from '@nestjs/swagger';

@ApiTags('Failed Events (Admin)')
@Controller('failed-events')
export class FailedEventsController {
  constructor(private readonly failedEventsService: FailedEventsService) {}

  @Roles('ADMIN', 'SUPERADMIN')
  @Get()
  @ApiOperation({ summary: 'Lấy danh sách các message lỗi (Dead Letter)' })
  async findAll(@Query() searchRequest: FailedEventSearchDto) {
    const { result, pagination } =
      await this.failedEventsService.findAll(searchRequest);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách failed events thành công',
      result,
      pagination,
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
