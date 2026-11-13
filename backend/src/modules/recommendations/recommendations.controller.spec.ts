import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { RecommendationsController } from './recommendations.controller';
import { IRecommendationsService } from './recommendations.service';

describe('RecommendationsController', () => {
  let controller: RecommendationsController;
  let recommendationsService: {
    getSimilarMovies: jest.Mock;
    getSimilarMoviesByCursor: jest.Mock;
    semanticSearch: jest.Mock;
    semanticSearchByCursor: jest.Mock;
    hybridSearch: jest.Mock;
    hybridSearchByCursor: jest.Mock;
  };

  beforeEach(async () => {
    recommendationsService = {
      getSimilarMovies: jest.fn(),
      getSimilarMoviesByCursor: jest.fn(),
      semanticSearch: jest.fn(),
      semanticSearchByCursor: jest.fn(),
      hybridSearch: jest.fn(),
      hybridSearchByCursor: jest.fn(),
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

  it('GET /semantic-search gọi service và trả envelope chuẩn', async () => {
    recommendationsService.semanticSearch.mockResolvedValue({
      result: [{ id: 5, title: 'Phim', similarityScore: 0.9, score: 0.9 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });

    const res = await controller.semanticSearch('hành động', undefined, 10);

    expect(recommendationsService.semanticSearch).toHaveBeenCalledWith(
      'hành động',
      10,
    );
    expect(res).toEqual({
      success: true,
      statusCode: 200,
      message: expect.any(String),
      result: [{ id: 5, title: 'Phim', similarityScore: 0.9, score: 0.9 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('GET /semantic-search nhận alias query khi thiếu keyword', async () => {
    recommendationsService.semanticSearch.mockResolvedValue({
      result: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 0 },
    });

    await controller.semanticSearch(undefined, 'hành động', 10);

    expect(recommendationsService.semanticSearch).toHaveBeenCalledWith(
      'hành động',
      10,
    );
  });

  it('GET /semantic-search thiếu từ khoá thì trả 400', async () => {
    await expect(
      controller.semanticSearch(undefined, undefined, 10),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('GET /semantic-search/cursor trả envelope + pagination cursor', async () => {
    recommendationsService.semanticSearchByCursor.mockResolvedValue({
      result: [{ id: 5, title: 'Phim', similarityScore: 0.9, score: 0.9 }],
      pagination: { limit: 12, total: 20, hasMore: true, nextCursor: 12 },
    });

    const res = await controller.semanticSearchByCursor(
      'hành động',
      undefined,
      '0',
      12,
    );

    expect(recommendationsService.semanticSearchByCursor).toHaveBeenCalledWith(
      'hành động',
      { cursor: '0', limit: 12 },
    );
    expect(res).toEqual({
      success: true,
      statusCode: 200,
      message: expect.any(String),
      result: [{ id: 5, title: 'Phim', similarityScore: 0.9, score: 0.9 }],
      pagination: { limit: 12, total: 20, hasMore: true, nextCursor: 12 },
    });
  });

  it('GET /for-you gọi service với userId/token từ request và trả envelope', async () => {
    recommendationsService.hybridSearch.mockResolvedValue({
      result: [{ id: 5, title: 'Phim', score: 0.9 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    const req = {
      user: { sub: 'user-1' },
      headers: { authorization: 'Bearer access-token' },
    } as unknown as Request;

    const res = await controller.hybridSearch(req, 10);

    expect(recommendationsService.hybridSearch).toHaveBeenCalledWith(
      'user-1',
      'access-token',
      10,
    );
    expect(res).toEqual({
      success: true,
      statusCode: 200,
      message: expect.any(String),
      result: [{ id: 5, title: 'Phim', score: 0.9 }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
  });

  it('GET /for-you/cursor gọi service và trả pagination cursor', async () => {
    recommendationsService.hybridSearchByCursor.mockResolvedValue({
      result: [{ id: 5, title: 'Phim', score: 0.9 }],
      pagination: { limit: 12, total: 20, hasMore: true, nextCursor: 12 },
    });
    const req = {
      user: { sub: 'user-1' },
      headers: { authorization: 'Bearer access-token' },
    } as unknown as Request;

    const res = await controller.hybridSearchByCursor(req, undefined, 12);

    expect(recommendationsService.hybridSearchByCursor).toHaveBeenCalledWith(
      'user-1',
      'access-token',
      { cursor: undefined, limit: 12 },
    );
    expect(res).toEqual({
      success: true,
      statusCode: 200,
      message: expect.any(String),
      result: [{ id: 5, title: 'Phim', score: 0.9 }],
      pagination: { limit: 12, total: 20, hasMore: true, nextCursor: 12 },
    });
  });
});
