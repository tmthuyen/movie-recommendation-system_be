import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Số item mặc định cho một trang cursor. */
export const DEFAULT_CURSOR_LIMIT = 12;

/** Giới hạn cứng cho một trang cursor. */
export const MAX_CURSOR_LIMIT = 50;

/**
 * Query cursor cho các endpoint không có keyword (similar, for-you).
 * `cursor` là opaque string do backend sinh ra, client không parse.
 */
export class CursorQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor opaque từ response trước; bỏ trống ở trang đầu.',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Số item mỗi trang.',
    default: DEFAULT_CURSOR_LIMIT,
    minimum: 1,
    maximum: MAX_CURSOR_LIMIT,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_CURSOR_LIMIT)
  limit?: number = DEFAULT_CURSOR_LIMIT;
}

/**
 * Query cursor cho các endpoint tìm kiếm (semantic, rerank).
 * `keyword` bắt buộc; `cursor` và `limit` kế thừa từ `CursorQueryDto`.
 */
export class SearchCursorQueryDto extends CursorQueryDto {
  @ApiProperty({
    description: 'Từ khóa tìm kiếm.',
  })
  @IsString()
  @IsNotEmpty()
  keyword: string;
}
