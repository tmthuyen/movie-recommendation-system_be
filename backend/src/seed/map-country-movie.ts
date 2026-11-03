import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import { Movie } from '../modules/movies/entities/movie.entity';
import { Country } from '@/modules/countries/entities/country.entity';

// parse country thành list code
// "['VN', 'US', 'JP']"
const parseCountryCodes = (countryString: string): string[] => {
  if (!countryString) {
    return [];
  }

  // xoa cac ky tu ngoai le nhu [ ] ' "
  // countryString = countryString.replace(/[\[\]'"]/g, '');
  throw new Error('Mở comment để chạy code nha kkkkkkkkkkk');

  const splitCodes = countryString.split(',').map(code => code.trim());

  // Split the string by commas and trim whitespace
  return splitCodes.filter(code => code.length > 0);
};

async function bootstrap() {
  console.log('Khởi tạo ứng dụng NestJS Context để Seed Data...');
  const app = await NestFactory.createApplicationContext(AppModule);

  // Lấy DataSource từ TypeORM để thao tác trực tiếp với DB
  const dataSource = app.get(DataSource);
  const movieRepo = dataSource.getRepository(Movie);
  const countryRepo = dataSource.getRepository(Country);

  const allCountry = await countryRepo
    .createQueryBuilder('country')
    .select(['country.code', 'country.id'])
    .getMany();
  console.log('Countries fetched:', allCountry.length);
  // map country code to country id
  const countryCodeToIdMap = new Map<string, number>();
  allCountry.forEach(country => {
    countryCodeToIdMap.set(country.code, country.id);
  });

  const movies = await movieRepo
    .createQueryBuilder('movie')
    .select(['movie.id', 'movie.originCountry'])
    .getMany();

  console.log('Movies fetched:', movies.length);
  console.log(
    'Parsed country codes:',
    parseCountryCodes(movies[0].originCountry),
  );

  const countCodeNotFound = new Set<number>();

  for (const movie of movies) {
    const countryCodes = parseCountryCodes(movie.originCountry); // list

    for (const code of countryCodes) {
      const countryId = countryCodeToIdMap.get(code);
      if (countryId) {
        // Tạo quan hệ giữa movie và country
        await dataSource
          .createQueryBuilder()
          .relation(Movie, 'countries') // 'countries' là tên của quan hệ ManyToMany trong entity Movie
          .of(movie.id) // movie id
          .add(countryId); // country id
      } else {
        countCodeNotFound.add(movie.id);
        console.warn(
          `Country code ${code} not found in the database for movie ID ${movie.id}`,
        );
      }
    }
  }

  console.log(`Total country codes not found: ${countCodeNotFound.size}`);

  // count movie vơi country
  const movieWithCountryCount = await dataSource.query(
    `SELECT COUNT(*) as count FROM movie_countries;`,
  );

  console.log(
    `Total movie-country relationships created: ${movieWithCountryCount[0].count}`,
  );

  await app.close();
  console.log('Hoàn tất toàn bộ quy trình Seed!');
}

bootstrap().catch(err => {
  console.error('Lỗi khi seed data:', err);
  process.exit(1);
});

// run code: npx ts-node -r tsconfig-paths/register src/seed/map-country-movie.ts
