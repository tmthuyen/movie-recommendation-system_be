import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
    }),
  );

  app.enableCors();

  // swagger
  // 1. Khởi tạo cấu hình cơ bản cho Swagger
  const config = new DocumentBuilder()
    .setTitle('Tài liệu API dự án')
    .setDescription('Mô tả các API kết nối với Database')
    .setVersion('1.0')
    .addBearerAuth() // Thêm dòng này nếu API của bạn có dùng JWT Token (Passport)
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
