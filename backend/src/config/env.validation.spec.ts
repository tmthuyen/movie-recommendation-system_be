import 'reflect-metadata';

import { EnvironmentVariables, validateConfiguration } from './env.validation';

const validConfig = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  APP_PORT: 8081,
  NODE_ENV: 'test',
  DB_TYPE: 'postgres',
  DB_HOST: 'localhost',
  DB_PORT: 5432,
  DB_USERNAME: 'movie',
  DB_PASSWORD: 'secret',
  DB_NAME: 'movie_db',
  ACCESS_SECRET_KEY: 'access-secret',
  ACCESS_EXPIRES_IN: '15m',
  REFRESH_EXPIRES_IN: '7d',
  REDIS_HOST: 'localhost',
  REDIS_PORT: 6379,
  MAIL_PROVIDER: 'smtp',
  MAIL_HOST: 'smtp.gmail.com',
  MAIL_PORT: 587,
  MAIL_SECURE: false,
  MAIL_USER: 'user@gmail.com',
  MAIL_PASS: 'app-password',
  MAIL_FROM: 'noreply@movie.vn',
  S3_REGION: 'ap-southeast-1',
  S3_ENDPOINT: 'https://s3.example.com',
  S3_ACCESS_KEY: 'access-key',
  S3_SECRET_KEY: 'secret-key',
  S3_BUCKET_NAME: 'movie-bucket',
  S3_PUBLIC_URL: 'https://cdn.example.com',
  ...overrides,
});

describe('validateConfiguration', () => {
  it('cấu hình hợp lệ → trả về instance EnvironmentVariables đầy đủ field', () => {
    const result = validateConfiguration(validConfig());

    expect(result).toBeInstanceOf(EnvironmentVariables);
    expect(result).toMatchObject({
      APP_PORT: 8081,
      NODE_ENV: 'test',
      DB_HOST: 'localhost',
      MAIL_SECURE: false,
      S3_BUCKET_NAME: 'movie-bucket',
    });
  });

  it('enableImplicitConversion: chuỗi số được ép về number', () => {
    const result = validateConfiguration(
      validConfig({
        APP_PORT: '8081',
        DB_PORT: '5432',
        REDIS_PORT: '6379',
        MAIL_PORT: '2525',
      }),
    );

    expect(result.APP_PORT).toBe(8081);
    expect(result.DB_PORT).toBe(5432);
    expect(result.REDIS_PORT).toBe(6379);
    expect(result.MAIL_PORT).toBe(2525);
    for (const value of [
      result.APP_PORT,
      result.DB_PORT,
      result.REDIS_PORT,
      result.MAIL_PORT,
    ]) {
      expect(typeof value).toBe('number');
    }
  });

  it('BUG tiềm ẩn: chuỗi "false" bị ép thành true (Boolean của chuỗi khác rỗng)', () => {
    // enableImplicitConversion dùng Boolean(value); "false" là chuỗi khác rỗng
    // nên MAIL_SECURE/ASYNC_MAIL_ENABLED trong .env đều thành true.
    const result = validateConfiguration(
      validConfig({ MAIL_SECURE: 'false', ASYNC_MAIL_ENABLED: 'false' }),
    );

    expect(result.MAIL_SECURE).toBe(true);
    expect(result.ASYNC_MAIL_ENABLED).toBe(true);
  });

  it('chuỗi rỗng ở field bắt buộc → ném lỗi IsNotEmpty', () => {
    expect(() => validateConfiguration(validConfig({ DB_NAME: '' }))).toThrow(
      /DB_NAME has failed the following constraints: isNotEmpty/,
    );
  });

  it('số không hợp lệ → ném lỗi IsNumber', () => {
    expect(() =>
      validateConfiguration(validConfig({ MAIL_PORT: 'not-a-number' })),
    ).toThrow(/MAIL_PORT has failed the following constraints: isNumber/);
  });

  it('thiếu nhiều field bắt buộc → lỗi tổng hợp nêu đủ tên field', () => {
    const config = validConfig();
    delete config.DB_HOST;
    delete config.S3_BUCKET_NAME;

    let message = '';
    try {
      validateConfiguration(config);
    } catch (error) {
      message = (error as Error).message;
    }

    expect(message).toContain('DB_HOST');
    expect(message).toContain('S3_BUCKET_NAME');
  });

  it('các field optional được giữ nguyên khi truyền vào', () => {
    const result = validateConfiguration(
      validConfig({
        RABBITMQ_URL: 'amqp://localhost:5672',
        RABBITMQ_QUEUE: 'movie.queue',
        ASYNC_MAIL_ENABLED: true,
      }),
    );

    expect(result.RABBITMQ_URL).toBe('amqp://localhost:5672');
    expect(result.RABBITMQ_QUEUE).toBe('movie.queue');
    expect(result.ASYNC_MAIL_ENABLED).toBe(true);
  });

  it('có thể bỏ qua toàn bộ field optional mà vẫn hợp lệ', () => {
    expect(() => validateConfiguration(validConfig())).not.toThrow();
  });
});
