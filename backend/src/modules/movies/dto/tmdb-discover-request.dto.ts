import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { PaginationDto } from '@/common/dtos/pagination.dto';

export function parseTmdbIds(value: unknown): number[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) {
    return value
      .map(item =>
        typeof item === 'number'
          ? item
          : typeof item === 'string'
            ? Number(item)
            : NaN,
      )
      .filter(Number.isInteger);
  }
  if (typeof value !== 'string') return undefined;
  return value.split(',').map(Number).filter(Number.isInteger);
}

export class TmdbDiscoverRequestDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['popularity', 'release-year'],
    default: 'popularity',
    description:
      'popularity: sort theo độ phổ biến; release-year: sort theo ngày phát hành',
  })
  @IsIn(['popularity', 'release-year'])
  mode: 'popularity' | 'release-year' = 'popularity';

  @ApiPropertyOptional({
    example: '2020-01-01',
    description: 'Ngày phát hành bắt đầu (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  releaseDateFrom?: string;

  @ApiPropertyOptional({
    example: '2025-12-31',
    description: 'Ngày phát hành kết thúc (YYYY-MM-DD)',
  })
  @IsOptional()
  @IsString()
  releaseDateTo?: string;

  @ApiPropertyOptional({
    example: 2020,
    description: 'Năm phát hành bắt đầu (>= 1900)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  releaseYearFrom?: number;

  @ApiPropertyOptional({
    example: 2025,
    description: 'Năm phát hành kết thúc (>= 1900)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  releaseYearTo?: number;

  @ApiPropertyOptional({
    type: [Number],
    example: [28, 878],
    description:
      'TMDB genre ID. UI Scanner gửi 1 id; có thể lặp query hoặc dùng dấu phẩy.',
  })
  @IsOptional()
  @Transform(({ value }) => parseTmdbIds(value))
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  genreIds?: number[];

  @ApiPropertyOptional({
    enum: ['and', 'or'],
    default: 'or',
    description: 'Cách kết hợp nhiều genreIds (UI Scanner không gửi field này)',
  })
  @IsOptional()
  @IsIn(['and', 'or'])
  genreMode?: 'and' | 'or' = 'or';

  @ApiPropertyOptional({
    example: 'ko',
    description: 'Mã ngôn ngữ gốc theo iso_639_1 (2-10 ký tự)',
  })
  @IsOptional()
  @IsString()
  @Length(2, 10)
  originalLanguage?: string;

  @ApiPropertyOptional({
    example: 20,
    description: 'Số candidate tối đa (1-100)',
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  declare limit?: number;
}
