import {
  plainToInstance,
  Transform,
  TransformFnParams,
  Type,
} from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

/**
 * Chuyển giá trị env (chuỗi) sang boolean đúng nghĩa.
 *
 * Không dùng `enableImplicitConversion` cho boolean: class-transformer dùng
 * `Boolean(value)` nên chuỗi `"false"` (khác rỗng) bị đổi thành `true`.
 * Hàm này chỉ chấp nhận các giá trị đã biết; giá trị lạ được giữ nguyên để
 * `@IsBoolean()` báo lỗi cấu hình thay vì âm thầm bật/tắt sai.
 */
const toBoolean = ({ value }: TransformFnParams): unknown => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return value;
};

export class EnvironmentVariables {
  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  APP_PORT: number;

  @IsNotEmpty()
  @IsString()
  NODE_ENV: string;

  @IsNotEmpty()
  @IsString()
  DB_TYPE: string;

  @IsNotEmpty()
  @IsString()
  DB_HOST: string;

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  DB_PORT: number;

  @IsNotEmpty()
  @IsString()
  DB_USERNAME: string;

  @IsNotEmpty()
  @IsString()
  DB_PASSWORD: string;

  @IsNotEmpty()
  @IsString()
  DB_NAME: string;

  @IsNotEmpty()
  @IsString()
  ACCESS_SECRET_KEY: string;

  @IsNotEmpty()
  @IsString()
  ACCESS_EXPIRES_IN: string;

  @IsNotEmpty()
  @IsString()
  REFRESH_EXPIRES_IN: string;

  @IsString()
  REDIS_HOST: string;

  @IsNumber()
  @Type(() => Number)
  REDIS_PORT: number;

  @IsOptional()
  @IsString()
  RABBITMQ_URL: string;

  @IsOptional()
  @IsString()
  RABBITMQ_QUEUE: string;

  @IsOptional()
  @IsBoolean()
  @Transform(toBoolean)
  ASYNC_MAIL_ENABLED: boolean;

  /**
   * MAIL_PROVIDER=smtp # smtp, sendgrid, aes
    MAIL_HOST=smtp.gmail.com
    MAIL_PORT=587
    MAIL_SECURE=false
    MAIL_USER=tranthuyen2222@gmail.com
    MAIL_PASS=mwnkkzbvvbfriyha
    MAIL_FROM=tranthuyen2222@gmail.com
   */
  @IsNotEmpty()
  @IsString()
  MAIL_PROVIDER: string;

  @IsNotEmpty()
  @IsString()
  MAIL_HOST: string;

  @IsNotEmpty()
  @IsNumber()
  @Type(() => Number)
  MAIL_PORT: number;

  @IsNotEmpty()
  @IsBoolean()
  @Transform(toBoolean)
  MAIL_SECURE: boolean;

  @IsNotEmpty()
  @IsString()
  MAIL_USER: string;

  @IsNotEmpty()
  @IsString()
  MAIL_PASS: string;

  @IsNotEmpty()
  @IsString()
  MAIL_FROM: string;

  // --- S3 / R2 STORAGE ---
  @IsNotEmpty()
  @IsString()
  S3_REGION: string;

  @IsNotEmpty()
  @IsString()
  S3_ENDPOINT: string;

  @IsNotEmpty()
  @IsString()
  S3_ACCESS_KEY: string;

  @IsNotEmpty()
  @IsString()
  S3_SECRET_KEY: string;

  @IsNotEmpty()
  @IsString()
  S3_BUCKET_NAME: string;

  @IsNotEmpty()
  @IsString()
  S3_PUBLIC_URL: string;
}

export const validateConfiguration = (config: Record<string, unknown>) => {
  const validateConfig = plainToInstance(EnvironmentVariables, config);

  const errors = validateSync(validateConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validateConfig;
};
