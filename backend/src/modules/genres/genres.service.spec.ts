import { Test, TestingModule } from '@nestjs/testing';
import { GenresService } from './genres.service';
import { IGenreRepository } from './genres.repository';

describe('GenresService', () => {
  let service: GenresService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [GenresService, { provide: IGenreRepository, useValue: {} }],
    }).compile();

    service = module.get<GenresService>(GenresService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
