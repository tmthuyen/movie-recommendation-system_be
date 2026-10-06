// Api response types
export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  result: T;
}

export interface ApiPaginatedResponse<T = any> extends ApiResponse<T> {
  pagination: Pagination;
}

export interface Pagination {
  totalItems: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export type ApiErrorResponse = {
  success: false;
  statusCode: number;
  message: string;
  errors?: string[];
};

// User
export interface User {
  id: string;
  email: string;
  fullName: string;
  phoneNumber?: string;
  avatarUrl?: string;
  gender?: string;
  status: string;
  roleCodes: string[];

  createdAt: Date;
  createdBy: string;
  updatedAt: Date;
  updatedBy: string;
}

// Old
// =============
export type ApiErrorBody = {
  success: false;
  message: string;
  details?: string[];
};

export type ApiOkBody<T> = {
  success: true;
  message: string;
  data: T;
};
// Old
// =============
