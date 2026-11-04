import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsController } from './recommendations.controller';
import { IRecommendationsService } from './recommendations.service';

describe('RecommendationsController', () => {
  let controller: RecommendationsController;
  let recommendationsService: {
    getSimilarMovies: jest.Mock;
    semanticSearch: jest.Mock;
    hybridSearch: jest.Mock;
  };

  beforeEach(async () => {
    recommendationsService = {
      getSimilarMovies: jest.fn(),
      semanticSearch: jest.fn(),
      hybridSearch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationsController],
      providers: [
        {
          provide: IRecommendationsService,
          useValue: recommendationsService,
        },
      ],
    }).compile();

    controller = module.get<RecommendationsController>(
      RecommendationsController,
    );
  });

  it('GET /similar/:id trả envelope chuẩn + result/pagination từ service', async () => {
    recommendationsService.getSimilarMovies.mockResolvedValue({
      result: [{ id: 5, title: 'Phim', similarityScore: 0.9, rank: 1 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const res = await controller.getSimilarMovies(5, 3);

    expect(recommendationsService.getSimilarMovies).toHaveBeenCalledWith(5, 3);
    expect(res).toEqual({
      success: true,
      statusCode: 200,
      message: expect.any(String),
      result: [{ id: 5, title: 'Phim', similarityScore: 0.9, rank: 1 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('GET /similar/:id ép kiểu tham số path sang number', async () => {
    recommendationsService.getSimilarMovies.mockResolvedValue({
      result: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    await controller.getSimilarMovies('12' as unknown as number, undefined);

    expect(recommendationsService.getSimilarMovies).toHaveBeenCalledWith(
      12,
      NaN,
    );
  });

  it('GET /semantic-search hiện là stub trả {status,message,data:[]} (không envelope)', () => {
    const res = controller.semanticSearch('hành động', 10);

    expect(res).toEqual({
      status: 'success',
      message: expect.any(String),
      data: [],
    });
  });

  it('GET /hybrid-search hiện là stub trả {status,message,data:[]}', () => {
    const res = controller.hybridSearch({
      userId: 'user-1',
      keyword: 'hành động',
      topK: 10,
      page: 1,
      pageSize: 10,
    });

    expect(res).toEqual({
      status: 'success',
      message: expect.any(String),
      data: [],
    });
  });
});
