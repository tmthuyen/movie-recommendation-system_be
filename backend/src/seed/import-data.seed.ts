import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { Movie } from '../modules/movies/entities/movie.entity';
import { Genre } from '../modules/genres/entities/genre.entity';
import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';
import { SeedRating } from '@/modules/ratings/entities/seed-rating.entity';

async function bootstrap() {
  console.log('Khởi tạo ứng dụng NestJS Context để Seed Data...');
  const app = await NestFactory.createApplicationContext(AppModule);

  // Lấy DataSource từ TypeORM để thao tác trực tiếp với DB
  const dataSource = app.get(DataSource);
  const movieRepo = dataSource.getRepository(Movie);
  const genreRepo = dataSource.getRepository(Genre);
  const seedRatingRepo = dataSource.getRepository(SeedRating);

  // --- ĐỒNG BỘ LẠI SEQUENCE CHO AUTO_INCREMENT (PostgreSQL) ---
  console.log('Đồng bộ lại Sequence ID cho Movies...');
  try {
    await dataSource.query(`
      SELECT setval(
        pg_get_serial_sequence('movies', 'id'), 
        COALESCE((SELECT MAX(id) FROM movies), 1)
      );
    `);

    // Nếu bạn cũng import bảng genres, nên chạy thêm cho genres
    await dataSource.query(`
      SELECT setval(
        pg_get_serial_sequence('genres', 'id'), 
        COALESCE((SELECT MAX(id) FROM genres), 1)
      );
    `);
    await dataSource.query(`
      SELECT setval(
        pg_get_serial_sequence('seed_ratings', 'id'), 
        COALESCE((SELECT MAX(id) FROM seed_ratings), 1)
      );
    `);

    console.log('✅ Đã đồng bộ Sequence thành công!');
  } catch (error) {
    console.error(
      'Lỗi khi đồng bộ Sequence (Có thể do bạn không dùng Postgres):',
      error,
    );
  }

  const genresFilePath = path.join(__dirname, 'genres.csv');
  const moviesFilePath = path.join(
    __dirname,
    'all_movies_fully_translated.csv',
  );
  const movieGenresFilePath = path.join(__dirname, 'movie_genres.csv');
  const ratingsFilePath = path.join(__dirname, 'ratings.csv');

  // --- 1. SEED GENRES ---
  if (fs.existsSync(genresFilePath)) {
    console.log('Bắt đầu seed Genres...');
    await new Promise<void>((resolve, reject) => {
      const genres: Genre[] = [];
      fs.createReadStream(genresFilePath)
        .pipe(parse({ columns: true, trim: true }))
        .on('data', row => {
          if (row.genre_id && row.name) {
            const genre = genreRepo.create({
              id: Number(row.genre_id),
              name: row.name,
            });
            genres.push(genre);
          }
        })
        .on('end', async () => {
          try {
            // Lưu theo batch để tối ưu
            await genreRepo.save(genres, { chunk: 1000 });
            console.log(`✅ Đã seed thành công ${genres.length} Genres.`);
            resolve();
          } catch (error) {
            reject(error);
          }
        })
        .on('error', error => reject(error));
    });
  }

  // --- 2. SEED MOVIES ---
  if (fs.existsSync(movieGenresFilePath)) {
    console.log('Bắt đầu seed Movies...');
    await new Promise<void>((resolve, reject) => {
      let count = 0;
      const batch: Movie[] = [];

      fs.createReadStream(moviesFilePath)
        .pipe(parse({ columns: true, trim: true }))
        .on('data', async row => {
          // Bỏ qua những row chưa có movieId
          // if (!row.movieId) return;
          if (row.movieId) return;

          const movie = movieRepo.create({
            // id: Number(row.movieId),
            tmdbId: Number(row.tmdb_id),
            imdbId: row.imdb_id || null,
            title: row.title || null,
            titleVi: row.title_vi || null,
            overview: row.overview || null,
            overviewVi: row.overview_vi || null,
            releaseDate: row.release_date || null,
            posterPath: row.poster_path || null,
            backdropPath: row.backdrop_path || null,
            homepage: row.homepage || null,
            originCountry: row.origin_country || null,
            originalLanguage: row.original_language || null,
            budget: row.budget ? Number(row.budget) : 0,
            revenue: row.revenue ? Number(row.revenue) : 0,
            status: row.status || null,
            video: row.video === 'True',
            isAiTranslated: row.is_ai_translated === 'True',
            voteAverage: row.vote_average ? Number(row.vote_average) : 0,
            voteCount: row.vote_count ? Number(row.vote_count) : 0,
            viewCount: 0,
          });

          batch.push(movie);
          count++;

          // Nếu file quá lớn (vd 40k dòng), nên xử lý theo chunk trong stream thay vì lưu tất cả vào memory
          // Tuy nhiên với 40k dòng memory vẫn chịu được, ta sẽ chờ đến khi kết thúc stream để save chunk
        })
        .on('end', async () => {
          try {
            console.log(`Chuẩn bị lưu ${batch.length} Movies vào Database...`);
            // Lưu theo chunk 1000 để tránh quá tải DB parameters
            // await movieRepo.save(batch, { chunk: 1000 });

            console.log(`✅ Đã seed thành công ${batch.length} Movies.`);
            resolve();
          } catch (error) {
            reject(error);
          }
        })
        .on('error', error => reject(error));
    });
  }

  // --- 3. SEED MOVIE GENRES (CODE MINH HỌA) ---
  if (fs.existsSync(movieGenresFilePath)) {
    console.log('Code minh họa cho seed Movie Genres...');
    // Để seed movie genres (Join table ManyToMany), bạn có thể dùng QueryBuilder
    // chèn trực tiếp vào bảng trung gian hoặc gọi quan hệ. Tuy nhiên vì file
    // movie_genres chứa tmdb_id, bạn cần map nó với movie.id trước.

    const movieIds = await movieRepo.find({
      select: { id: true, tmdbId: true },
    });

    const movieMap: Map<number, number> = new Map();
    movieIds.forEach(movie => {
      movieMap.set(+movie.tmdbId, movie.id);
    });

    // console.log(movieMap.get(1768789));

    await new Promise<void>((resolve, reject) => {
      const relations: { movie_id: number; genre_id: number }[] = [];

      fs.createReadStream(movieGenresFilePath)
        .pipe(parse({ columns: true, trim: true }))
        .on('data', row => {
          const tmdbId = Number(row.tmdb_id);
          const genreId = Number(row.genre_id);

          const movieId = movieMap.get(tmdbId);

          // console.log('movie id', movieId);
          // console.log('tmdb_id', tmdbId);

          if (movieId) {
            relations.push({ movie_id: movieId, genre_id: genreId });
          }

          // return Promise.resolve();
        })
        .on('end', async () => {
          try {
            // Lưu trực tiếp vào bảng trung gian 'movie_genres'
            for (const relation of relations) {
              await dataSource
                .createQueryBuilder()
                .insert()
                .into('movie_genres')
                .values(relation)
                .execute();
            }
            console.log('✅ Code minh họa seed Movie Genres.');
            resolve();
          } catch (error) {
            reject(error);
          }
        });
    });
  }

  // 4 seed ratings
  if (fs.existsSync(ratingsFilePath)) {
    console.log('seeed ratings');

    // key: movieId, userId, rating, timestamp
    try {
      let batch: SeedRating[] = [];
      const parser = fs
        .createReadStream(ratingsFilePath)
        .pipe(parse({ columns: true, trim: true }));

      for await (const row of parser) {
        if (row.userId) {
          const obj = seedRatingRepo.create({
            userId: row.userId,
            movieId: row.movieId,
            score: Number(row.rating) * 2,
            createdAt: new Date(row.timestamp * 1000),
          });
          batch.push(obj);

          if (batch.length >= 2000) {
            // await seedRatingRepo.save(batch);
            await dataSource
              .createQueryBuilder()
              .insert()
              .into(SeedRating)
              .values(batch)
              .orIgnore() // Tự động lướt qua nếu trùng User+Movie, không báo lỗi
              .execute();
            batch = [];
          }
        }
      }

      if (batch.length > 0) {
        await seedRatingRepo.save(batch);
      }
      console.log(`✅ Đã seed thành công Seed Ratings.`);
    } catch (error) {
      console.error('Lỗi khi seed ratings:', error);
    }
  }

  await app.close();
  console.log('Hoàn tất toàn bộ quy trình Seed!');
}

bootstrap().catch(err => {
  console.error('Lỗi khi seed data:', err);
  process.exit(1);
});

// run code: npx ts-node -r tsconfig-paths/register src/seed/import-data.seed.ts
