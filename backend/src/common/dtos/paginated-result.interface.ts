import { Pagination } from '@/common/dtos/api-response.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ResultWithPagination<T> {
  result: T[];
  pagination: Pagination;
}
