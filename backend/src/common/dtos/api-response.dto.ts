export interface Pagination {
  totalItems: number;

  totalPages: number;

  currentPage: number;

  pageSize: number;
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
