import { AppException } from '@/common/custom-exception/app-exception';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { HttpStatus } from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsArray, IsOptional, IsString } from 'class-validator';

/** Sort option interface
 * field: string, direction: 'ASC' | 'DESC'
 */
export interface SortOption {
  field: string;
  direction: 'ASC' | 'DESC';
}

export const OPERATOR_MAP: Record<string, string> = {
  eq: 'eq',
  ne: 'ne',
  gt: 'gt',
  gte: 'gte',
  lt: 'lt',
  lte: 'lte',
  in: 'in',
  notin: 'notIn',
  between: 'between',
  contains: 'contains',
  isnull: 'isNull',
  isnotnull: 'isNotNull',
};

export interface SearchFilter {
  field: string;
  operator: string;
  value: string;
}

export const parseValuesToArray = (value: unknown): unknown[] => {
  if (value === undefined || value === null || value === '') {
    return [];
  }

  return Array.isArray(value) ? value : [value];
};

export class BaseSearchRequest extends PaginationDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => parseValuesToArray(value))
  filters?: string[]; // field:operator:value,field:operator:value,...

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => parseValuesToArray(value))
  sort?: string[] = ['createdAt:DESC'];
}
