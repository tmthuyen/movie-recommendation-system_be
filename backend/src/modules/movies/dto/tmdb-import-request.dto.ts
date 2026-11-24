import { Transform } from 'class-transformer';
import { IsArray, IsInt, IsOptional, Min, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { parseTmdbIds } from './tmdb-discover-request.dto';

export class TmdbImportRequestDto {
  @ApiPropertyOptional({
    example: 550,
    description: 'Một TMDB ID cần thêm. Bắt buộc nếu không gửi tmdbIds.',
  })
  @ValidateIf((dto: TmdbImportRequestDto) => dto.tmdbIds === undefined)
  @IsInt()
  @Min(1)
  tmdbId?: number;

  @ApiPropertyOptional({
    type: [Number],
    example: [550, 603],
    description: 'Danh sách TMDB ID cần thêm (ưu tiên hơn tmdbId).',
  })
  @IsOptional()
  @Transform(({ value }) => parseTmdbIds(value))
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  tmdbIds?: number[];
}
