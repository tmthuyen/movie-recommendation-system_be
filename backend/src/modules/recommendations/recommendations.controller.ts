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

  // /api/recommendations/hybrid?topK=20
  @UseGuards(JwtAuthGuard)
  @Get('/for-you')
  async hybridSearch(@Req() req: Request, @Query('topK') topK: number) {
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
      topK,
    );
    return {
      status: 'success',
      message: 'This endpoint is a placeholder for hybrid recommendation.',
      result: res.result,
      pagination: res.pagination,
    };
  }
}
