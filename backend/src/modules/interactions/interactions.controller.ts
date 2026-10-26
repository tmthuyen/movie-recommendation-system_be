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
import { PaginationDto } from '@/common/dtos/pagination.dto';
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
  async findAll(@Query() paginationDto: PaginationDto) {
    const { data, ...pagination } =
      await this.interactionsService.findAll(paginationDto);
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy danh sách tương tác thành công',
      result: data,
      pagination: pagination,
    };
  }

  @Get('my-history')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy lịch sử xem phim của cá nhân' })
  async getMyHistory(
    @Req() req: Request,
    @Query() paginationDto: PaginationDto,
  ) {
    const { sub: userId } = req.user as JwtPayload;
    const { data, ...pagination } = await this.interactionsService.getHistory(
      userId,
      paginationDto,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy lịch sử xem phim thành công',
      result: data,
      pagination: pagination,
    };
  }

  @Get('my-favorites')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách phim yêu thích (like) của cá nhân' })
  async getMyFavorites(
    @Req() req: Request,
    @Query() paginationDto: PaginationDto,
  ) {
    const { sub: userId } = req.user as JwtPayload;
    const { data, ...pagination } = await this.interactionsService.getFavorites(
      userId,
      paginationDto,
    );
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy danh sách phim yêu thích thành công',
      result: data,
      pagination: pagination,
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
}
