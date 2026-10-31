import { readFile, writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { Country } from '@/modules/countries/entities/country.entity';
const getCountries = async ({
  limit,
  offset,
}: {
  limit: number;
  offset: number;
}) => {
  const url = `https://api.restcountries.com/countries/v5?limit=${limit}&offset=${offset}&pretty=1`;
  const res = await fetch(url, {
    headers: {
      Authorization: 'Bearer rc_live_0ad4c950c359485293756a1b52f33f7a',
    },
  });

  const { data } = await res.json();

  // keys: data { objects: [], meta}
  // check key
  if (!data || !Array.isArray(data.objects)) {
    throw new Error('Invalid response from API');
  }

  const countries = (data?.objects as any[]) || [];
  if (countries.length === 0) {
    console.error('No countries found in the API response');
    return [];
  }

  return countries;
};

const COUNTRY_FILES = {
  all: 'src/seed/countries_all.json',
  mapped: 'src/seed/countries_mapped.json',
  countries_vi: 'src/seed/countries_vi.json',
  countries_processed: 'src/seed/countries_processed.json',
};

interface CountryDTO {
  en_name: string;
  vi_name: string;
  code: string;
  region: string;
  subregion: string;
}

const fetchAndSaveCountries = async () => {
  const limit = 100;

  let countries = [];

  for (let i = 0; i < 5; i++) {
    const data = await getCountries({
      limit,
      offset: i * limit,
    });

    console.log(`Lấy dữ liệu quốc gia từ API: ${data.length} quốc gia`);
    countries = countries.concat(...data);
  }

  const allCountriesFileName = COUNTRY_FILES.all;
  await writeFile(
    allCountriesFileName,
    JSON.stringify(countries, null, 2),
    'utf-8',
  );
  console.log(
    `Đã lưu tất cả dữ liệu quốc gia vào file: ${allCountriesFileName}`,
  );

  // map countries: name, code, region, subregion

  const mappedCountries = countries.map((country: any) => ({
    name: country.names.common,
    code: country.codes.alpha_2,
    region: country.region,
    subregion: country.subregion,
  }));

  const mappedCountriesFileName = COUNTRY_FILES.mapped;
  await writeFile(
    mappedCountriesFileName,
    JSON.stringify(mappedCountries, null, 2),
    'utf-8',
  );
  console.log(
    `Đã lưu dữ liệu quốc gia đã được ánh xạ vào file: ${mappedCountriesFileName}`,
  );
};

const processCountries = async (): Promise<CountryDTO[]> => {
  // read file: array with (name, code, region, subregion)
  const mappedCountries = JSON.parse(
    await readFile(COUNTRY_FILES.mapped, 'utf-8'),
  );
  console.log(`Số lượng quốc gia đã được ánh xạ: ${mappedCountries.length}`);

  // read countries vi: array with (name, en_name)
  const countriesVi = JSON.parse(
    await readFile(COUNTRY_FILES.countries_vi, 'utf-8'),
  );

  console.log(`Số lượng quốc gia có tên tiếng Việt: ${countriesVi.length}`);

  // process countries with en_name, vi_name, code, region, subregion
  const processedCountries =
    mappedCountries.map((country: any) => {
      const viCountry = countriesVi.find(
        (c: any) => c.en_name.toLowerCase() === country.name.toLowerCase(),
      );

      return {
        en_name: country.name,
        vi_name: viCountry ? viCountry.name : '',
        code: country.code || null,
        region: country.region,
        subregion: country.subregion,
      };
    }) || [];

  console.log(`Số lượng quốc gia đã được xử lý: ${processedCountries.length}`);

  const processedCountriesFileName = COUNTRY_FILES.countries_processed;
  await writeFile(
    processedCountriesFileName,
    JSON.stringify(processedCountries, null, 2),
    'utf-8',
  );
  console.log(
    `Đã lưu dữ liệu quốc gia đã được xử lý vào file: ${processedCountriesFileName}`,
  );

  return processedCountries;
};

async function bootstrap() {
  // await fetchAndSaveCountries();
  const processedCountries = await processCountries();

  // save to db

  console.log('Khởi tạo ứng dụng NestJS Context để Seed Data...');
  const app = await NestFactory.createApplicationContext(AppModule);

  // Lấy DataSource từ TypeORM để thao tác trực tiếp với DB
  const dataSource = app.get(DataSource);
  const countryRepo = dataSource.getRepository(Country);

  // --- SEED COUNTRIES ---
  console.log('Bắt đầu seed Countries...');
  try {
    const startTime = Date.now();

    // start transaction
    await dataSource.transaction(async manager => {
      // delete all countries
      await manager.deleteAll(Country);

      for (let i = 0; i < processedCountries.length; i++) {
        if (i % 50 === 0) {
          console.log(
            `Đang seed Country thứ ${i + 1}/${processedCountries.length}...`,
          );
        }

        const countryData = processedCountries[i];
        const country = manager.create(Country, {
          en_name: countryData.en_name,
          vi_name: countryData.vi_name,
          code: countryData.code,
          region: countryData.region,
          subregion: countryData.subregion,
        });
        await manager.save(country);
      }
    });

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    console.log(
      `✅ Đã seed thành công ${processedCountries.length} Countries trong ${duration} giây.`,
    );

    // read db
    const countriesInDb = await countryRepo.find();
    console.log(`Số lượng quốc gia trong DB: ${countriesInDb.length}`);
  } catch (error) {
    console.error('Lỗi khi seed Countries:', error);
  }

  await app.close();
  console.log('Hoàn tất toàn bộ quy trình Seed!');
}

bootstrap().catch(err => {
  console.error('Lỗi khi seed data:', err);
  process.exit(1);
});

// run code: npx ts-node -r tsconfig-paths/register src/seed/country.seed.ts
