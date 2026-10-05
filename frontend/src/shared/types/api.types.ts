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
