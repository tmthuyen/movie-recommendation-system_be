import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { FailedEventStatus } from '@/modules/failed-events/entities/failed-event.entity';
import { IsEnum, IsOptional } from 'class-validator';

/**
 * Query cho GET /failed-events.
 * Giữ `status` để tương thích client cũ (`?status=PENDING`);
 * đồng thời vẫn hỗ trợ `filters=status:eq:PENDING`.
 */
export class FailedEventSearchDto extends BaseSearchRequest {
  @IsOptional()
  @IsEnum(FailedEventStatus)
  status?: FailedEventStatus;
}
