export type RateLimitStrategy =
  'fixed-window' | 'sliding-window' | 'token-bucket';
export type RateLimitKeyType = 'ip' | 'user' | 'ip-and-user';

export interface RateLimitOptions {
  /**
   * Thuật toán sử dụng
   */
  strategy: RateLimitStrategy;
  /**
   * Số lượng request tối đa
   */
  limit: number;
  /**
   * Khoảng thời gian giới hạn (milliseconds)
   */
  windowMs: number;
  /**
   * Xác định key chặn theo IP, User hay cả hai
   * @default 'ip'
   */
  type?: RateLimitKeyType;
  /**
   * Tùy chọn thông báo lỗi trả về
   */
  errorMessage?: string;
}
