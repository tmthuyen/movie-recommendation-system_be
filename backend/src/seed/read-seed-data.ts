import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse';

// Định nghĩa kiểu dữ liệu cho từng dòng (Row)
interface Genre {
  id: number;
  name: string;
}

interface Movie {
  id: number;
  tmdb_id: number;
  imdb_id: string;
  title: string;
  title_vi: string;
  overview: string;
  overview_vi: string;
}

interface MovieGenre {
  tmdb_id: number;
  genre_id: number;
}

interface SeedRating {
  id: number;
  fake_user_id: number;
  movie_id: number;
  rating: number;
}

enum SeedFileType {
  MOVIE = 'movie',
  MOVIE_GENRE = 'movie_genre',
  GENRE = 'genre',
}

const genresFilePath = path.join(__dirname, 'genres.csv');
const moviesFilePath = path.join(__dirname, 'all_movies_fully_translated.csv');
const movieGenresFilePath = path.join(__dirname, 'movie_genres.csv');

const processCsvInChunks = (
  filePath: string,
  type: SeedFileType,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    let count = 0;

    fs.createReadStream(filePath)
      .pipe(
        parse({
          columns: true,
          trim: true,
        }),
      )
      .on('data', (row: any) => {
        count++;

        if (count == 1) console.log('Keys', Object.keys(row));

        // XỬ LÝ DỮ LIỆU TỪNG DÒNG Ở ĐÂY
        if (type == SeedFileType.MOVIE) {
          const movie: Movie = {
            tmdb_id: Number(row.tmdb_id),
            ...row,
            // genre_id: Number(row.genre_id),
          };
        } else if (type == SeedFileType.MOVIE_GENRE) {
          const movieGenre: MovieGenre = {
            tmdb_id: Number(row.tmdb_id),
            genre_id: Number(row.genre_id),
          };
        } else if (type == SeedFileType.GENRE) {
          const genre: Genre = {
            id: Number(row.id),
            name: row.name,
          };
        }

        // Ví dụ: Cứ mỗi 10,000 dòng thì log tiến trình ra màn hình
        if (count % 10000 === 0) {
          console.log(`Đã xử lý xong ${count} dòng...`);
          return;
        }
      })
      .on('end', () => {
        console.log(
          `🎉 Đã xử lý hoàn tất toàn bộ file CSV! Tổng số dòng: ${count}`,
        );
        resolve();
      })
      .on('error', error => {
        reject(error);
      });
  });
};

// Chạy thử hàm xử lý
processCsvInChunks(moviesFilePath, SeedFileType.MOVIE).catch(err =>
  console.error('Lỗi:', err),
);
processCsvInChunks(genresFilePath, SeedFileType.GENRE).catch(err =>
  console.error('Lỗi:', err),
);
processCsvInChunks(movieGenresFilePath, SeedFileType.MOVIE_GENRE).catch(err =>
  console.error('Lỗi:', err),
);
