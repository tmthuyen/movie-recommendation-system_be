import { Test, TestingModule } from '@nestjs/testing';
import { MoviesController } from './movies.controller';
import { MoviesService } from './movies.service';
import { IFetchMovieService } from './interfaces/fetch-movie.interface';

describe('MoviesController', () => {
  let controller: MoviesController;
  let moviesService: { search: jest.Mock };
  let fetchMovieService: {
    getGenreOptions: jest.Mock;
    getLanguageOptions: jest.Mock;
  };

  beforeEach(async () => {
    moviesService = { search: jest.fn() };
    fetchMovieService = {
      getGenreOptions: jest
        .fn()
        .mockResolvedValue([{ id: 28, name: 'Hành động' }]),
      getLanguageOptions: jest
        .fn()
        .mockResolvedValue([
          { code: 'ko', englishName: 'Korean', name: '한국어' },
        ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MoviesController],
      providers: [
        { provide: MoviesService, useValue: moviesService },
        { provide: IFetchMovieService, useValue: fetchMovieService },
      ],
    }).compile();

    controller = module.get<MoviesController>(MoviesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns TMDB genre options', async () => {
    const result = await controller.getTmdbGenres();

    expect(fetchMovieService.getGenreOptions).toHaveBeenCalledTimes(1);
    expect(result.result).toEqual([{ id: 28, name: 'Hành động' }]);
    expect(result.message).toBe('Lấy danh sách thể loại TMDB thành công');
  });

  it('returns TMDB language options', async () => {
    const result = await controller.getTmdbLanguages();

    expect(fetchMovieService.getLanguageOptions).toHaveBeenCalledTimes(1);
    expect(result.result).toEqual([
      { code: 'ko', englishName: 'Korean', name: '한국어' },
    ]);
  });
});
