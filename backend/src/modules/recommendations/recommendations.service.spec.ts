import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsService } from './recommendations.service';
import { IMovieRepository } from '@/modules/movies/movies.repository';
import { MoviesService } from '@/modules/movies/movies.service';

describe('RecommendationsService', () => {
  let service: RecommendationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        {
          provide: IMovieRepository,
          useValue: {},
        },
        {
          provide: MoviesService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<RecommendationsService>(RecommendationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
