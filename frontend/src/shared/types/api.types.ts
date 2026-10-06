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

export interface ApiResponse<T = any> {
  statusCode: number;
  message: string;
  data: T;
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  avatarUrl: string;
  gender: string;
  status: string;
  roles: string[];
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
