import { Controller, Get, Inject, Logger, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IRecommendationsService } from './recommendations.service';
import { HybridSearchQuery } from '@/modules/recommendations/dtos/hybrid-search-query.dto';
import { CursorQueryDto } from '@/common/dtos/cursor-query.dto';

@ApiTags('recommendations')
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

  // /api/recommendations/similar/:id/cursor?limit=12&cursor=...
  @Get('/similar/:id/cursor')
  @ApiOperation({
    summary: 'Load-more phim tương tự bằng cursor',
    description:
      'Trang đầu bỏ trống cursor. Dùng nextCursor trong pagination cho trang kế.',
  })
  @ApiQuery({
    name: 'cursor',
    required: false,
    type: String,
    description: 'Cursor opaque từ response trước.',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    example: 12,
    description: 'Số item mỗi trang (1-50).',
  })
  async getSimilarMoviesByCursor(
    @Param('id') movieId: number,
    @Query() query: CursorQueryDto,
  ) {
    this.logger.log(
      `Received request for similar movies by cursor of movieId=${movieId}, limit=${query.limit}`,
    );

    const res = await this.recommendationsService.getSimilarMoviesByCursor(
      Number(movieId),
      query,
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Danh sách phim tương tự đã được lấy thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/semantic-search?keyword=...&topK=10 (hoặc query=...)
  @Get('/semantic-search')
  @ApiOperation({
    summary: 'Tìm kiếm phim theo ngữ nghĩa (Semantic Search)',
  })
  async semanticSearch(
    @Query('keyword') keyword?: string,
    @Query('topK') topK?: number,
    @Query('query') queryAlias?: string,
  ) {
    const searchKeyword =
      keyword || queryAlias || cursorQuery?.keyword || cursorQuery?.query || '';
    this.logger.log(
      `Received request for semantic search keyword="${searchKeyword}", topK=${topK}`,
    );

    const res = await this.recommendationsService.semanticSearch(
      searchKeyword,
      Number(topK),
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Tìm kiếm phim theo ngữ nghĩa thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/semantic-search/cursor?keyword=...&limit=12&cursor=...
  @Get('/semantic-search/cursor')
  @ApiOperation({
    summary: 'Load-more tìm kiếm ngữ nghĩa (Semantic Search) bằng cursor',
    description:
      'Trang đầu bỏ trống cursor. Dùng nextCursor trong pagination cho trang kế.',
  })
  async semanticSearchByCursor(
    @Query('keyword') keyword?: string,
    @Query('query') queryAlias?: string,
    @Query() cursorQuery?: CursorQueryDto,
  ) {
    const searchKeyword =
      keyword || queryAlias || cursorQuery?.keyword || cursorQuery?.query || '';
    this.logger.log(
      `Received request for semantic search by cursor keyword="${searchKeyword}", limit=${cursorQuery?.limit}`,
    );

    const res = await this.recommendationsService.semanticSearchByCursor(
      searchKeyword,
      cursorQuery ?? {},
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Tìm kiếm phim theo ngữ nghĩa thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/search-rerank?keyword=...&topK=10
  @Get('/search-rerank')
  @ApiOperation({
    summary: 'Tìm kiếm kết hợp Lexical (PostgreSQL) + Semantic Rerank (AI)',
  })
  async searchLexicalSemanticRerank(
    @Query('keyword') keyword?: string,
    @Query('topK') topK?: number,
    @Query('query') queryAlias?: string,
  ) {
    const searchKeyword =
      keyword || queryAlias || cursorQuery?.keyword || cursorQuery?.query || '';
    this.logger.log(
      `Received request for lexical+semantic rerank keyword="${searchKeyword}", topK=${topK}`,
    );

    const res = await this.recommendationsService.searchLexicalSemanticRerank(
      searchKeyword,
      Number(topK),
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Tìm kiếm kết hợp từ khóa và ngữ nghĩa thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/search-rerank/cursor?keyword=...&limit=12&cursor=...
  @Get('/search-rerank/cursor')
  @ApiOperation({
    summary: 'Load-more tìm kiếm kết hợp Lexical + Semantic Rerank bằng cursor',
  })
  async searchLexicalSemanticRerankByCursor(
    @Query('keyword') keyword?: string,
    @Query('query') queryAlias?: string,
    @Query() cursorQuery?: CursorQueryDto,
  ) {
    const searchKeyword =
      keyword || queryAlias || cursorQuery?.keyword || cursorQuery?.query || '';
    this.logger.log(
      `Received request for lexical+semantic rerank cursor keyword="${searchKeyword}", limit=${cursorQuery?.limit}`,
    );

    const res =
      await this.recommendationsService.searchLexicalSemanticRerankByCursor(
        searchKeyword,
        cursorQuery ?? {},
      );

    return {
      success: true,
      statusCode: 200,
      message: 'Tìm kiếm kết hợp từ khóa và ngữ nghĩa thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/hybrid-search?userId=...&keyword=...&topK=10&page=1&pageSize=10
  @Get('/hybrid-search')
  async hybridSearch(@Query() hybridSearchQuery: HybridSearchQuery) {
    const res =
      await this.recommendationsService.hybridSearch(hybridSearchQuery);

    return {
      success: true,
      statusCode: 200,
      message: 'Tìm kiếm lai (Hybrid Search) thành công.',
      result: res?.result ?? [],
      pagination: res?.pagination ?? {
        page: hybridSearchQuery?.page ?? 1,
        limit: hybridSearchQuery?.pageSize ?? 10,
        total: 0,
        totalPages: 0,
      },
    };
  }
}
