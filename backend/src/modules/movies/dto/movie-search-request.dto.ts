import { PaginationDto } from '@/common/dtos/pagination.dto';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export function parseIds(value: unknown): number[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];

  return values.map(Number);
}

export class MovieSearchRequestDto extends PaginationDto {
  @IsOptional()
  @IsString()
  sort: string = 'releaseDate:DESC'; // default sort option

  @IsOptional()
  @Transform(({ value }) => parseIds(value))
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  genreIds?: number[]; // optional array of genre IDs to filter by

  // countryIds filter
  @IsOptional()
  @Transform(({ value }) => parseIds(value))
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  countryIds?: number[]; // optional array of country IDs to filter by

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  releaseYearFrom?: number; // optional release date range filter (from)

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  releaseYearTo?: number; // optional release date range filter (to)
}
