import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Logger,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IRecommendationsService } from './recommendations.service';
import {
  CursorQueryDto,
  SearchCursorQueryDto,
} from '@/common/dtos/cursor-query.dto';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';
import { type Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '@/modules/auth/guards/optional-jwt-auth.guard';
import { AppException } from '@/common/custom-exception/app-exception';
import { type SearchEventContext } from '@/infrastructure/messaging/search-event.service';

type SearchRequest = Request & { correlationId?: string };

@ApiTags('recommendations')
@Controller('recommendations')
export class RecommendationsController {
  private readonly logger = new Logger(RecommendationsController.name);
  constructor(
    @Inject(IRecommendationsService)
    private readonly recommendationsService: IRecommendationsService,
  ) {}

  private toSearchContext(req?: SearchRequest): SearchEventContext {
    const user = req?.user as JwtPayload | undefined;
    return {
      userId: user?.sub,
      correlationId: req?.correlationId,
    };
  }

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
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Tìm phim theo ngữ nghĩa (topK)' })
  @ApiQuery({ name: 'keyword', required: false, type: String })
  @ApiQuery({ name: 'topK', required: false, type: Number, example: 10 })
  async semanticSearch(
    @Query('keyword') keyword: string,
    @Query('topK') topK?: number,
    @Req() req?: SearchRequest,
  ) {
    this.logger.log(
      `Received request for semantic search keyword="${keyword}", topK=${topK}`,
    );
    if (!keyword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Thiếu từ khoá tìm kiếm.',
        'keyword is required.',
        'VALIDATION_ERROR',
      );
    }

    const res = await this.recommendationsService.semanticSearch(
      keyword,
      Number(topK),
      this.toSearchContext(req),
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
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary:
      'Tìm kiếm kết hợp Lexical (BM25 Qdrant) + Semantic (Sentence-BERT) Rerank (RRF)',
  })
  async searchLexicalSemanticRerank(
    @Query('keyword') keyword: string,
    @Query('topK') topK?: number,
    @Req() req?: SearchRequest,
  ) {
    this.logger.log(
      `Received request for lexical+semantic rerank keyword="${keyword}", topK=${topK}`,
    );

    const res = await this.recommendationsService.searchLexicalSemanticRerank(
      keyword,
      Number(topK),
      this.toSearchContext(req),
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
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Load-more tìm kiếm kết hợp Lexical + Semantic Rerank bằng cursor',
  })
  async searchLexicalSemanticRerankByCursor(
    @Query() cursorQuery: SearchCursorQueryDto,
    @Req() req?: SearchRequest,
  ) {
    this.logger.log(
      `Received request for lexical+semantic rerank cursor keyword="${cursorQuery.keyword}", limit=${cursorQuery.limit}`,
    );

    const res =
      await this.recommendationsService.searchLexicalSemanticRerankByCursor(
        cursorQuery,
        {
          ...this.toSearchContext(req),
          isFirstPage: !cursorQuery.cursor,
        },
      );

    return {
      success: true,
      statusCode: 200,
      message: 'Tìm kiếm kết hợp từ khóa và ngữ nghĩa thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/semantic-search/cursor?keyword=...&limit=12&cursor=12
  @Get('/semantic-search/cursor')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Load-more tìm kiếm ngữ nghĩa bằng cursor',
    description:
      'Cursor là rank cuối cùng của trang trước. Trang đầu bỏ trống cursor.',
  })
  async semanticSearchByCursor(
    @Query() cursorQuery: SearchCursorQueryDto,
    @Req() req?: SearchRequest,
  ) {
    const { keyword, cursor, limit } = cursorQuery;
    if (!keyword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Thiếu từ khoá tìm kiếm.',
        'keyword is required.',
        'VALIDATION_ERROR',
      );
    }

    const res = await this.recommendationsService.semanticSearchByCursor(
      {
        cursor,
        keyword,
        limit: limit === undefined ? undefined : Number(limit),
      },
      {
        ...this.toSearchContext(req),
        isFirstPage: !cursor,
      },
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Danh sách phim theo ngữ nghĩa đã được lấy thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/lexical-search/cursor?keyword=...&limit=12&cursor=12
  @Get('/lexical-search/cursor')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Load-more tìm kiếm từ khóa BM25 bằng cursor',
    description:
      'Cursor là rank cuối cùng của trang trước. Trang đầu bỏ trống cursor.',
  })
  async lexicalSearchByCursor(
    @Query() cursorQuery: SearchCursorQueryDto,
    @Req() req?: SearchRequest,
  ) {
    const { keyword, cursor, limit } = cursorQuery;
    if (!keyword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Thiếu từ khoá tìm kiếm.',
        'keyword is required.',
        'VALIDATION_ERROR',
      );
    }

    const res = await this.recommendationsService.lexicalSearchByCursor(
      {
        cursor,
        keyword,
        limit: limit === undefined ? undefined : Number(limit),
      },
      {
        ...this.toSearchContext(req),
        isFirstPage: !cursor,
      },
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Danh sách phim theo từ khóa đã được lấy thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/for-you?topK=20
  @UseGuards(JwtAuthGuard)
  @Get('/for-you')
  @ApiOperation({ summary: 'Gợi ý phim cá nhân hoá (topK)' })
  @ApiQuery({ name: 'topK', required: false, type: Number, example: 20 })
  async forYou(@Req() req: Request, @Query('topK') topK?: number) {
    const { sub } = req.user as JwtPayload;

    const accessToken = req.headers['authorization']?.split(' ')[1];
    if (!accessToken) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Access token is missing in the request headers.',
        'The access token is required to access this endpoint.',
        'UNAUTHORIZED',
      );
    }

    const res = await this.recommendationsService.forYou(
      sub,
      accessToken,
      Number(topK),
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Danh sách phim gợi ý đã được lấy thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/for-you/cursor?limit=12&cursor=12
  @UseGuards(JwtAuthGuard)
  @Get('/for-you/cursor')
  @ApiOperation({
    summary: 'Load-more gợi ý cá nhân hoá bằng cursor',
    description:
      'Cursor là rank cuối cùng của trang trước. Trang đầu bỏ trống cursor.',
  })
  @ApiQuery({ name: 'cursor', required: false, type: Number, example: 12 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 12 })
  async forYouByCursor(@Req() req: Request, @Query() query: CursorQueryDto) {
    const { sub } = req.user as JwtPayload;

    const accessToken = req.headers['authorization']?.split(' ')[1];
    if (!accessToken) {
      throw new AppException(
        HttpStatus.UNAUTHORIZED,
        'Access token is missing in the request headers.',
        'The access token is required to access this endpoint.',
        'UNAUTHORIZED',
      );
    }

    const res = await this.recommendationsService.forYouByCursor(
      sub,
      accessToken,
      query.cursor,
      query.limit,
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Danh sách phim gợi ý đã được lấy thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }
}
