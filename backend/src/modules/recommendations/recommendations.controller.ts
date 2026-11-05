import { Controller, Get, Inject, Logger, Param, Query } from '@nestjs/common';
import { IRecommendationsService } from './recommendations.service';
import { HybridSearchQuery } from '@/modules/recommendations/dtos/hybrid-search-query.dto';

@Controller('recommendations')
export class RecommendationsController {
  private readonly logger = new Logger(RecommendationsController.name);
  constructor(
    @Inject(IRecommendationsService)
    private readonly recommendationsService: IRecommendationsService,
  ) {}

  // /api/recommendations/similar/:id?topK
  @Get('/similar/:id')
  async getSimilarMovies(
    @Param('id') movieId: number,
    @Query('topK') topK?: number,
  ) {
    // receive log
    this.logger.log(
      `Received request for similar movies of movieId=${movieId} with topK=${topK}`,
    );

    const res = await this.recommendationsService.getSimilarMovies(
      Number(movieId),
      Number(topK),
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Danh sách phim tương tự đã được lấy thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/semantic-search?keyword=...&topK=10
  @Get('/semantic-search')
  semanticSearch(
    @Query('keyword') keyword: string,
    @Query('topK') topK?: number,
  ) {
    return {
      status: 'success',
      message:
        'This endpoint is a placeholder for semantic search recommendation.',
      data: [],
    };
  }

  // /api/recommendations/hybrid-search?userId=...&keyword=...&topK=10&page=1&pageSize=10
  @Get('/hybrid-search')
  hybridSearch(@Query() hybridSearchQuery: HybridSearchQuery) {
    return {
      status: 'success',
      message: 'This endpoint is a placeholder for hybrid recommendation.',
      data: [],
    };
  }
}
