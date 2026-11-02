import { PaginationDto } from '@/common/dtos/pagination.dto';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

const parseIds = (value: unknown): unknown => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return value;

  return value.split(',').map(id => Number(id.trim()));
};

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
