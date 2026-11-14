import {
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
import { type Request } from 'express';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';

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
  async remove(@Param('id') id: string) {
    const result = await this.interactionsService.remove(+id);

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
}
