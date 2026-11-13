import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsController } from './recommendations.controller';
import { IRecommendationsService } from './recommendations.service';

describe('RecommendationsController', () => {
  let controller: RecommendationsController;
  let recommendationsService: {
    getSimilarMovies: jest.Mock;
    getSimilarMoviesByCursor: jest.Mock;
    semanticSearch: jest.Mock;
    semanticSearchByCursor: jest.Mock;
    searchLexicalSemanticRerank: jest.Mock;
    searchLexicalSemanticRerankByCursor: jest.Mock;
    hybridSearch: jest.Mock;
  };

  beforeEach(async () => {
    recommendationsService = {
      getSimilarMovies: jest.fn(),
      getSimilarMoviesByCursor: jest.fn(),
      semanticSearch: jest.fn(),
      semanticSearchByCursor: jest.fn(),
      searchLexicalSemanticRerank: jest.fn(),
      searchLexicalSemanticRerankByCursor: jest.fn(),
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

  it('GET /similar/:id/cursor trả envelope + pagination cursor', async () => {
    recommendationsService.getSimilarMoviesByCursor.mockResolvedValue({
      result: [{ id: 5, title: 'Phim', similarityScore: 0.9, rank: 1 }],
      pagination: {
        limit: 12,
        total: 20,
        hasMore: true,
        nextCursor: 'cursor-2',
      },
    });

    const res = await controller.getSimilarMoviesByCursor(5, {
      cursor: 'cursor-1',
      limit: 12,
    });

    expect(
      recommendationsService.getSimilarMoviesByCursor,
    ).toHaveBeenCalledWith(5, { cursor: 'cursor-1', limit: 12 });
    expect(res).toEqual({
      success: true,
      statusCode: 200,
      message: expect.any(String),
      result: [{ id: 5, title: 'Phim', similarityScore: 0.9, rank: 1 }],
      pagination: {
        limit: 12,
        total: 20,
        hasMore: true,
        nextCursor: 'cursor-2',
      },
    });
  });

  it('GET /similar/:id/cursor ép kiểu path id sang number', async () => {
    recommendationsService.getSimilarMoviesByCursor.mockResolvedValue({
      result: [],
      pagination: {
        limit: 12,
        total: 0,
        hasMore: false,
        nextCursor: null,
      },
    });

    await controller.getSimilarMoviesByCursor('12' as unknown as number, {
      limit: 12,
    });

    expect(
      recommendationsService.getSimilarMoviesByCursor,
    ).toHaveBeenCalledWith(12, { limit: 12 });
  });

  it('GET /semantic-search trả envelope chuẩn + result/pagination từ service', async () => {
    recommendationsService.semanticSearch.mockResolvedValue({
      result: [{ id: 1, title: 'Phim', similarityScore: 0.85, rank: 1 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const res = await controller.semanticSearch('hành động', 10);

    expect(recommendationsService.semanticSearch).toHaveBeenCalledWith(
      'hành động',
      10,
    );
    expect(res).toEqual({
      success: true,
      statusCode: 200,
      message: expect.any(String),
      result: [{ id: 1, title: 'Phim', similarityScore: 0.85, rank: 1 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('GET /semantic-search/cursor trả envelope + pagination cursor', async () => {
    recommendationsService.semanticSearchByCursor.mockResolvedValue({
      result: [{ id: 1, title: 'Phim', similarityScore: 0.85, rank: 1 }],
      pagination: {
        limit: 12,
        total: 10,
        hasMore: false,
        nextCursor: null,
      },
    });

    const res = await controller.semanticSearchByCursor('hành động', undefined, {
      limit: 12,
    });

    expect(recommendationsService.semanticSearchByCursor).toHaveBeenCalledWith(
      'hành động',
      { limit: 12 },
    );
    expect(res).toEqual({
      success: true,
      statusCode: 200,
      message: expect.any(String),
      result: [{ id: 1, title: 'Phim', similarityScore: 0.85, rank: 1 }],
      pagination: {
        limit: 12,
        total: 10,
        hasMore: false,
        nextCursor: null,
      },
    });
  });

  it('GET /search-rerank trả envelope chuẩn + result/pagination từ service', async () => {
    recommendationsService.searchLexicalSemanticRerank.mockResolvedValue({
      result: [{ id: 2, title: 'Phim B', similarityScore: 0.91, rank: 1 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const res = await controller.searchLexicalSemanticRerank('vũ trụ', 10);

    expect(
      recommendationsService.searchLexicalSemanticRerank,
    ).toHaveBeenCalledWith('vũ trụ', 10);
    expect(res).toEqual({
      success: true,
      statusCode: 200,
      message: expect.any(String),
      result: [{ id: 2, title: 'Phim B', similarityScore: 0.91, rank: 1 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('GET /hybrid-search trả envelope chuẩn từ service', async () => {
    recommendationsService.hybridSearch.mockResolvedValue({
      result: [{ id: 3, title: 'Phim C', similarityScore: 0.88, rank: 1 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const res = await controller.hybridSearch({
      userId: 'user-1',
      keyword: 'hành động',
      topK: 10,
      page: 1,
      pageSize: 10,
    });

    expect(res).toEqual({
      success: true,
      statusCode: 200,
      message: expect.any(String),
      result: [{ id: 3, title: 'Phim C', similarityScore: 0.88, rank: 1 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });
});
