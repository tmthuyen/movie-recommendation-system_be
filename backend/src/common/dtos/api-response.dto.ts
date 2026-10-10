export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T> {
  success: boolean;

  statusCode: number;

  message: string;

  result: T;
}

export interface ApiResponseWithPagination<T> extends ApiResponse<T> {
  pagination: Pagination;
}
