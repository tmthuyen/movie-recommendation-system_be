import { Test, TestingModule } from '@nestjs/testing';
import { CountriesService } from './countries.service';
import { ICountryRepository } from './countries.repository';

describe('CountriesService', () => {
  let service: CountriesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CountriesService,
        { provide: ICountryRepository, useValue: {} },
      ],
    }).compile();

    service = module.get<CountriesService>(CountriesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
