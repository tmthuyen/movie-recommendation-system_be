import { Transform, Type } from 'class-transformer';
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
  @IsIn(['popularity', 'release-year'])
  mode: 'popularity' | 'release-year' = 'popularity';

  @IsOptional()
  @IsString()
  releaseDateFrom?: string;

  @IsOptional()
  @IsString()
  releaseDateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  releaseYearFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  releaseYearTo?: number;

  @IsOptional()
  @Transform(({ value }) => parseTmdbIds(value))
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  genreIds?: number[];

  @IsOptional()
  @IsIn(['and', 'or'])
  genreMode?: 'and' | 'or' = 'or';

  @IsOptional()
  @IsString()
  @Length(2, 10)
  originalLanguage?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  declare limit?: number;
}
