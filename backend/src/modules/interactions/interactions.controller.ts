import {
  BadRequestException,
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { MyActivitiesQueryDto } from './dto/my-activities-query.dto';
import { type Request } from 'express';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';
import type {
  HotMovie,
  StatsMetric,
  StatsPeriod,
} from './movie-interaction-stats.service';

@ApiTags('Interactions')
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle yêu thích phim (Yêu cầu đăng nhập)' })
  async create(
    @Req() req: Request,
    @Body() createInteractionDto: CreateInteractionDto,
  ) {
    const { sub: userId } = req.user as JwtPayload;
    const result = await this.interactionsService.create(
      userId,
      createInteractionDto,
    );

    return {
      success: true,
      statusCode: 200,
      message:
        result.action === 'added' ? 'Đã thêm vào yêu thích' : 'Đã bỏ yêu thích',
      result,
    };
  }

  @Get('stats/popular')
  @ApiOperation({ summary: 'Phim popular mọi thời đại (Redis ZSET)' })
  async getPopular(@Query('limit') limit?: string) {
    const size = this.parseLimit(limit);
    const result = await this.interactionsService.getMovieRanking(
      'popular',
      'all',
      'all',
      size,
    );
    return this.rankingResponse(
      result,
      size,
      'Lấy danh sách phim popular thành công',
    );
  }

  @Get('stats/hot')
  @ApiOperation({ summary: 'Phim hot theo ngày/tuần/tháng (Redis ZSET)' })
  async getHot(
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    const size = this.parseLimit(limit);
    const parsedPeriod = this.parsePeriod(period, false);
    const result = await this.interactionsService.getMovieRanking(
      'hot',
      parsedPeriod,
      parsedPeriod,
      size,
    );
    return this.rankingResponse(
      result,
      size,
      'Lấy danh sách phim hot thành công',
    );
  }

  @Get('stats/top')
  @ApiOperation({ summary: 'Top phim theo metric và khung thời gian' })
  async getTop(
    @Query('metric') metric?: string,
    @Query('period') period?: string,
    @Query('limit') limit?: string,
  ) {
    const size = this.parseLimit(limit);
    const parsedMetric = this.parseMetric(metric);
    const parsedPeriod = this.parsePeriod(period, true);
    const result = await this.interactionsService.getMovieRanking(
      'top',
      parsedMetric,
      parsedPeriod,
      size,
    );
    return this.rankingResponse(
      result,
      size,
      'Lấy bảng xếp hạng phim thành công',
    );
  }

  @Get('stats/:movieId')
  @ApiOperation({ summary: 'Lấy thống kê tương tác của phim (Public)' })
  async getStats(@Param('movieId') movieId: string) {
    const stats = await this.interactionsService.getMovieStats(+movieId);
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy thống kê tương tác thành công',
      result: { movieId: +movieId, ...stats },
    };
  }

  @Get()
  @ApiOperation({ summary: 'Lấy tất cả tương tác (Public)' })
  async findAll(@Query() searchRequest: BaseSearchRequest) {
    const { result, pagination } =
      await this.interactionsService.findAll(searchRequest);
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy danh sách tương tác thành công',
      result,
      pagination,
    };
  }

  @Get('my-history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy lịch sử xem phim của cá nhân' })
  async getMyHistory(
    @Req() req: Request,
    @Query() searchRequest: BaseSearchRequest,
  ) {
    const { sub: userId } = req.user as JwtPayload;
    const { result, pagination } = await this.interactionsService.getHistory(
      userId,
      searchRequest,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy lịch sử xem phim thành công',
      result,
      pagination,
    };
  }

  @Get('my-favorites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách phim yêu thích (like) của cá nhân' })
  async getMyFavorites(
    @Req() req: Request,
    @Query() searchRequest: BaseSearchRequest,
  ) {
    const { sub: userId } = req.user as JwtPayload;
    const { result, pagination } = await this.interactionsService.getFavorites(
      userId,
      searchRequest,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy danh sách phim yêu thích thành công',
      result,
      pagination,
    };
  }

  @Get('my-activities')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Lịch sử tương tác của cá nhân (click, like, rating, comment)',
  })
  async getMyActivities(
    @Req() req: Request,
    @Query() query: MyActivitiesQueryDto,
  ) {
    const { sub: userId } = req.user as JwtPayload;
    const { result, pagination } =
      await this.interactionsService.getMyActivities(userId, query);
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy lịch sử tương tác thành công',
      result,
      pagination,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết tương tác (Public)' })
  async findOne(@Param('id') id: string) {
    const result = await this.interactionsService.findOne(+id);

    return {
      success: true,

      statusCode: 200,

      message: 'Success',

      result,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá tương tác (Yêu cầu đăng nhập)' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const { sub: userId } = req.user as JwtPayload;
    const result = await this.interactionsService.remove(+id, userId);

    return {
      success: true,

      statusCode: 200,

      message: 'Success',

      result,
    };
  }

  // GET: /interactions/movie/:movieId/me
  @Get('movie/:movieId/me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Lấy danh sách tương tác của user với movie cụ thể (Yêu cầu đăng nhập)',
  })
  async getMyInteractionsWithMovie(
    @Req() req: Request,
    @Param('movieId') movieId: number,
  ) {
    const { sub: userId } = req.user as JwtPayload;
    const data = await this.interactionsService.getInteractionsByUserAndMovie(
      userId,
      Number(movieId),
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy danh sách tương tác với movie thành công',
      result: data,
    };
  }

  private parseLimit(value?: string): number {
    const limit = Number(value ?? 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('Giới hạn phải là số nguyên từ 1 đến 100.');
    }
    return limit;
  }

  private parseMetric(value?: string): StatsMetric {
    const metrics: StatsMetric[] = ['view', 'like', 'comment', 'rating'];
    if (!value || !metrics.includes(value as StatsMetric)) {
      throw new BadRequestException(
        'Metric phải là view, like, comment hoặc rating.',
      );
    }
    return value as StatsMetric;
  }

  private parsePeriod(
    value: string | undefined,
    allowAll: boolean,
  ): StatsPeriod {
    const periods: StatsPeriod[] = allowAll
      ? ['all', 'day', 'week', 'month']
      : ['day', 'week', 'month'];
    if (!value || !periods.includes(value as StatsPeriod)) {
      throw new BadRequestException(
        allowAll
          ? 'Period phải là all, day, week hoặc month.'
          : 'Period phải là day, week hoặc month.',
      );
    }
    return value as StatsPeriod;
  }

  private rankingResponse(result: HotMovie[], limit: number, message: string) {
    return {
      success: true,
      statusCode: 200,
      message,
      result,
      pagination: {
        total: result.length,
        page: 1,
        limit,
        totalPages: 1,
      },
    };
  }
}
