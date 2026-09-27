import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { UpdateRatingDto } from './dto/update-rating.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { type Request } from 'express';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';

@ApiTags('Ratings')
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm đánh giá mới (Yêu cầu đăng nhập)' })
  async create(@Req() req: Request, @Body() createRatingDto: CreateRatingDto) {
    const { sub } = req.user as JwtPayload;
    return await this.ratingsService.create(sub, createRatingDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy tất cả đánh giá (Public)' })
  async findAll(@Query() paginationDto: PaginationDto) {
    return await this.ratingsService.findAll(paginationDto);
  }

  @Get('movie/:movieId')
  @ApiOperation({ summary: 'Lấy đánh giá của một bộ phim (Public)' })
  async findByMovie(
    @Param('movieId') movieId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return await this.ratingsService.findByMovie(+movieId, paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết đánh giá (Public)' })
  async findOne(@Param('id') id: string) {
    return await this.ratingsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật đánh giá của mình (Yêu cầu đăng nhập)' })
  async update(
    @Param('id') id: string,
    @Body() updateRatingDto: UpdateRatingDto,
  ) {
    // Note: should check if rating belongs to user
    return await this.ratingsService.update(+id, updateRatingDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá đánh giá (Chỉ dành cho ADMIN)' })
  async remove(@Param('id') id: string) {
    return await this.ratingsService.remove(+id);
  }
}
