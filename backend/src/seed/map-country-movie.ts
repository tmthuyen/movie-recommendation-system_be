import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { Movie } from '../modules/movies/entities/movie.entity';
import { Genre } from '../modules/genres/entities/genre.entity';
import { SeedRating } from '@/modules/ratings/entities/seed-rating.entity';

async function bootstrap() {
  console.log('Khởi tạo ứng dụng NestJS Context để Seed Data...');
  const app = await NestFactory.createApplicationContext(AppModule);

  // Lấy DataSource từ TypeORM để thao tác trực tiếp với DB
  const dataSource = app.get(DataSource);
  const movieRepo = dataSource.getRepository(Movie);
  const genreRepo = dataSource.getRepository(Genre);
  const seedRatingRepo = dataSource.getRepository(SeedRating);

  await app.close();
  console.log('Hoàn tất toàn bộ quy trình Seed!');
}

bootstrap().catch(err => {
  console.error('Lỗi khi seed data:', err);
  process.exit(1);
});

// run code: npx ts-node -r tsconfig-paths/register src/seed/map-country-movie.ts
