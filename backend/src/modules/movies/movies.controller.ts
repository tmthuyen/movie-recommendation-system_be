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
} from '@nestjs/common';
import { MoviesService } from './movies.service';
import { CreateMovieDto } from './dto/create-movie.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '@/modules/auth/guards/optional-jwt-auth.guard';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { type Request } from 'express';
import { Req } from '@nestjs/common';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';

@ApiTags('Movies')
@Controller('movies')
export class MoviesController {
  constructor(private readonly moviesService: MoviesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm phim mới (Chỉ dành cho ADMIN)' })
  async create(@Body() createMovieDto: CreateMovieDto) {
    return await this.moviesService.create(createMovieDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách phim (Public)' })
  async findAll(@Query() paginationDto: PaginationDto) {
    return await this.moviesService.findAll(paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết phim (Public)' })
  async findOne(@Param('id') id: string) {
    return await this.moviesService.findOne(+id);
  }

  @Post(':id/view')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tăng lượt xem cho phim và ghi log' })
  async incrementView(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload | undefined;
    return await this.moviesService.incrementViewCount(+id, user?.sub);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật phim (Chỉ dành cho ADMIN)' })
  async update(
    @Param('id') id: string,
    @Body() updateMovieDto: UpdateMovieDto,
  ) {
    return await this.moviesService.update(+id, updateMovieDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá phim (Chỉ dành cho ADMIN)' })
  async remove(@Param('id') id: string) {
    return await this.moviesService.remove(+id);
  }
}
