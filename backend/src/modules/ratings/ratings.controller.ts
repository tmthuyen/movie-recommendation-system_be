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

@ApiTags('Ratings')
@Controller('ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm đánh giá mới (Yêu cầu đăng nhập)' })
  create(@Req() req: any, @Body() createRatingDto: CreateRatingDto) {
    const userId = req.user.id;
    return this.ratingsService.create(userId, createRatingDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy tất cả đánh giá (Public)' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.ratingsService.findAll(paginationDto);
  }

  @Get('movie/:movieId')
  @ApiOperation({ summary: 'Lấy đánh giá của một bộ phim (Public)' })
  findByMovie(
    @Param('movieId') movieId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.ratingsService.findByMovie(+movieId, paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết đánh giá (Public)' })
  findOne(@Param('id') id: string) {
    return this.ratingsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật đánh giá của mình (Yêu cầu đăng nhập)' })
  update(@Param('id') id: string, @Body() updateRatingDto: UpdateRatingDto) {
    // Note: should check if rating belongs to user
    return this.ratingsService.update(+id, updateRatingDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá đánh giá (Chỉ dành cho ADMIN)' })
  remove(@Param('id') id: string) {
    return this.ratingsService.remove(+id);
  }
}
