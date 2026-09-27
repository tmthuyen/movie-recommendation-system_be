import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

export class EnvironmentVariables {
  @IsNotEmpty()
  @IsNumber()
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
  REDIS_PORT: number;

  @IsOptional()
  @IsBoolean()
  RABBITMQ_ENABLED: boolean;

  @IsOptional()
  @IsString()
  RABBITMQ_URL: string;

  @IsOptional()
  @IsString()
  RABBITMQ_QUEUE: string;

  @IsOptional()
  @IsBoolean()
  ASYNC_MAIL_ENABLED: boolean;

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
  const validateConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validateConfig, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }

  return validateConfig;
};
