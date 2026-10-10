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
    const result = await this.moviesService.create(createMovieDto);
    return {
      success: true,
      statusCode: 201,
      message: 'Created movie successfully',
      result,
    };
  }
  @Post('/test-created')
  // @UseGuards(JwtAuthGuard)
  // @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test movie created' })
  testMovieCreated(@Body() createMovieDto: CreateMovieDto) {
    const result = this.moviesService.testMovieCreated(createMovieDto);
    return {
      success: true,
      statusCode: 201,
      message: 'Tested movie created successfully',
      result,
    };
  }
  // @Post('/seed-created-movie')
  // // @UseGuards(JwtAuthGuard)
  // // @Roles('ADMIN', 'SUPERADMIN')
  // @ApiBearerAuth()
  // @ApiOperation({ summary: 'Seed movie created' })
  // async seedCreatedMovie() {
  //   await this.moviesService.seedMovies();
  //   return { message: 'Movies seeded successfully' };
  // }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách phim (Public)' })
  async findAll(@Query() paginationDto: PaginationDto) {
    const result = await this.moviesService.findAll(paginationDto);
    return {
      success: true,
      statusCode: 200,
      message: 'Get movies successfully',
      result: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết phim (Public)' })
  async findOne(@Param('id') id: string) {
    const result = await this.moviesService.findOne(+id);
    return {
      success: true,
      statusCode: 200,
      message: 'Get movie details successfully',
      result,
    };
  }

  @Post(':id/view')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tăng lượt xem cho phim và ghi log' })
  async incrementView(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as JwtPayload | undefined;
    const result = await this.moviesService.incrementViewCount(+id, user?.sub);
    return {
      success: true,
      statusCode: 200,
      message: 'Incremented view count successfully',
      result,
    };
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
    const result = await this.moviesService.update(+id, updateMovieDto);
    return {
      success: true,
      statusCode: 200,
      message: 'Updated movie successfully',
      result,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá phim (Chỉ dành cho ADMIN)' })
  async remove(@Param('id') id: string) {
    const result = await this.moviesService.remove(+id);
    return {
      success: true,
      statusCode: 200,
      message: 'Deleted movie successfully',
      result,
    };
  }
}
