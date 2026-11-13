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
import { CursorQueryDto } from '@/common/dtos/cursor-query.dto';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';
import { type Request } from 'express';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { AppException } from '@/common/custom-exception/app-exception';

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

  // /api/recommendations/semantic-search?keyword=...&topK=10
  @Get('/semantic-search')
  @ApiOperation({ summary: 'Tìm phim theo ngữ nghĩa (topK)' })
  @ApiQuery({ name: 'keyword', required: false, type: String })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'topK', required: false, type: Number, example: 10 })
  async semanticSearch(
    @Query('keyword') keyword?: string,
    @Query('query') query?: string,
    @Query('topK') topK?: number,
  ) {
    const searchKeyword = keyword ?? query;
    if (!searchKeyword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Thiếu từ khoá tìm kiếm.',
        'keyword is required.',
        'VALIDATION_ERROR',
      );
    }

    const res = await this.recommendationsService.semanticSearch(
      searchKeyword,
      Number(topK),
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Danh sách phim theo ngữ nghĩa đã được lấy thành công.',
      result: res.result,
      pagination: res.pagination,
    };
  }

  // /api/recommendations/semantic-search/cursor?keyword=...&limit=12&cursor=12
  @Get('/semantic-search/cursor')
  @ApiOperation({
    summary: 'Load-more tìm kiếm ngữ nghĩa bằng cursor',
    description:
      'Cursor là rank cuối cùng của trang trước. Trang đầu bỏ trống cursor.',
  })
  @ApiQuery({ name: 'keyword', required: false, type: String })
  @ApiQuery({ name: 'query', required: false, type: String })
  @ApiQuery({ name: 'cursor', required: false, type: Number, example: 12 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 12 })
  async semanticSearchByCursor(
    @Query('keyword') keyword?: string,
    @Query('query') searchQuery?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    const searchKeyword = keyword ?? searchQuery;
    if (!searchKeyword) {
      throw new AppException(
        HttpStatus.BAD_REQUEST,
        'Thiếu từ khoá tìm kiếm.',
        'keyword is required.',
        'VALIDATION_ERROR',
      );
    }

    const res = await this.recommendationsService.semanticSearchByCursor(
      searchKeyword,
      {
        cursor,
        limit: limit === undefined ? undefined : Number(limit),
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

  // /api/recommendations/for-you?topK=20
  @UseGuards(JwtAuthGuard)
  @Get('/for-you')
  @ApiOperation({ summary: 'Gợi ý phim cá nhân hoá (topK)' })
  @ApiQuery({ name: 'topK', required: false, type: Number, example: 20 })
  async hybridSearch(@Req() req: Request, @Query('topK') topK?: number) {
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

    const res = await this.recommendationsService.hybridSearch(
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
  async hybridSearchByCursor(
    @Req() req: Request,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
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

    const res = await this.recommendationsService.hybridSearchByCursor(
      sub,
      accessToken,
      {
        cursor,
        limit: limit === undefined ? undefined : Number(limit),
      },
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
