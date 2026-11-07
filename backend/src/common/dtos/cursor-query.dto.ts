import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** Số item mặc định cho một trang cursor. */
export const DEFAULT_CURSOR_LIMIT = 12;

/** Giới hạn cứng cho một trang cursor. */
export const MAX_CURSOR_LIMIT = 50;

/**
 * Query dùng chung cho các endpoint cursor (similar/hybrid/semantic).
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
