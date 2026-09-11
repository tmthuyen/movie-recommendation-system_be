export interface Pagination {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}
export interface ApiResponse<T> {
  statusCode: number;
  message: string;
  data: T;
}

export interface ApiResponseWithPagination<T> extends ApiResponse<T> {
  metadata: Pagination;
}
