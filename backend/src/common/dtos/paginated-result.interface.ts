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

/** Pagination dạng cursor, dùng chung cho similar/hybrid/semantic search. */
export interface CursorPagination {
  limit: number;
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
}

export interface ResultWithCursorPagination<T> {
  result: T[];
  pagination: CursorPagination;
}
