import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

export class QueryCommentDto extends BaseSearchRequest {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  parentId?: number;
}
