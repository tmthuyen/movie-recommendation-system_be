import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CountriesService } from './countries.service';
import { CountriesController } from './countries.controller';
import { Country } from './entities/country.entity';
import { CountryRepository, ICountryRepository } from './countries.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Country])],
  controllers: [CountriesController],
  providers: [
    {
      provide: ICountryRepository,
      useClass: CountryRepository,
    },
    CountriesService,
  ],
  exports: [CountriesService],
})
export class CountriesModule {}
