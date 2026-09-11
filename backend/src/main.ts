import '@config/tracing.config'; // Import cấu hình tracing trước khi khởi tạo ứng dụng NestJS
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { CamelCaseInterceptor } from './common/interceptors/camel-case.interceptor';
import { LoggingInterceptor } from '@/common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from '@/common/filters/http-exception.filter';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });
  const winstonLogger = app.get(WINSTON_MODULE_NEST_PROVIDER);
  app.useLogger(winstonLogger);

  app.setGlobalPrefix('api');

  // pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );

  // interceptors
  app.useGlobalInterceptors(new CamelCaseInterceptor());
  app.useGlobalInterceptors(new LoggingInterceptor(winstonLogger));

  // filters
  app.useGlobalFilters(new HttpExceptionFilter(winstonLogger));

  // cors
  app.enableCors();

  // swagger
  // 1. Khởi tạo cấu hình cơ bản cho Swagger
  const config = new DocumentBuilder()
    .setTitle('Tài liệu API dự án')
    .setDescription('Mô tả các API kết nối với Database')
    .setVersion('1.0')
    .setTermsOfService('https://example.com/terms')
    .addBearerAuth()
    .build();

  // 2. Tạo document từ cấu hình trên
  const document = SwaggerModule.createDocument(app, config);

  // 3. Setup đường dẫn để xem UI (ở đây là '/api')
  SwaggerModule.setup('api', app, document);

  const cfsv = app.get(ConfigService);
  const port = Number(cfsv.get<number>('APP_PORT'));

  await app.listen(port);
}
bootstrap();
