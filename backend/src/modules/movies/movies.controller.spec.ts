import { Test, TestingModule } from '@nestjs/testing';
import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';
import { IFetchMovieService } from './interfaces/fetch-movie.interface';

describe('MoviesController', () => {
  let controller: MoviesController;
  let moviesService: { search: jest.Mock };

  beforeEach(async () => {
    moviesService = { search: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MoviesController],
      providers: [
        { provide: MoviesService, useValue: {} },
        { provide: IFetchMovieService, useValue: {} },
      ],
    }).compile();

    controller = module.get<MoviesController>(MoviesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
