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
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { type Request } from 'express';
import { Req } from '@nestjs/common';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';
import { MovieSearchRequestDto } from '@/modules/movies/dto/movie-search-request.dto';
import { plainToInstance } from 'class-transformer';
import { MovieResponseDto } from '@/modules/movies/dto/movie-response.dto';
import { RecordViewDto } from '@/modules/movies/dto/record-view.dto';
import { type SearchEventContext } from '@/infrastructure/messaging/search-event.service';

import { TmdbDiscoverRequestDto } from './dto/tmdb-discover-request.dto';
import { TmdbImportRequestDto } from './dto/tmdb-import-request.dto';
import { Inject } from '@nestjs/common';
import { IFetchMovieService } from './interfaces/fetch-movie.interface';

type SearchRequest = Request & { correlationId?: string };

@ApiTags('Movies')
@Controller('movies')
export class MoviesController {
  constructor(
    private readonly moviesService: MoviesService,
    @Inject(IFetchMovieService)
    private readonly fetchMovieService: IFetchMovieService,
  ) {}

  @Get('/tmdb/discover')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy phim mới từ TMDB chưa có trong database' })
  async discoverTmdb(@Query() query: TmdbDiscoverRequestDto) {
    const result = await this.fetchMovieService.discover(query);
    const limit = query.limit ?? 10;
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy danh sách phim mới từ TMDB thành công',
      result,
      pagination: {
        page: query.page ?? 1,
        limit,
        total: result.length,
        totalPages: result.length === 0 ? 0 : 1,
      },
    };
  }

  @Post('/tmdb/import')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm phim đã chọn từ TMDB vào database' })
  async importTmdb(@Body() body: TmdbImportRequestDto) {
    const tmdbIds = body.tmdbIds || (body.tmdbId ? [body.tmdbId] : []);
    const result = await this.fetchMovieService.importMany(tmdbIds);
    return {
      success: true,
      statusCode: 201,
      message: 'Thêm phim mới từ TMDB thành công',
      result: result.map(movie =>
        plainToInstance(MovieResponseDto, movie, {
          excludeExtraneousValues: true,
        }),
      ),
    };
  }

  @Post('/tmdb/discover-and-import')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tự động lấy và thêm candidate hợp lệ từ TMDB' })
  async discoverAndImportTmdb(@Query() query: TmdbDiscoverRequestDto) {
    const result = await this.fetchMovieService.discoverAndImport(query);
    return {
      success: true,
      statusCode: 201,
      message: 'Tự động thêm phim mới từ TMDB thành công',
      result: result.map(movie =>
        plainToInstance(MovieResponseDto, movie, {
          excludeExtraneousValues: true,
        }),
      ),
    };
  }

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
      result: plainToInstance(MovieResponseDto, result, {
        excludeExtraneousValues: true,
      }),
    };
  }
  @Post('/test-created')
  // @UseGuards(JwtAuthGuard)
  // @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test movie created' })
  async testMovieCreated(@Body() createMovieDto: CreateMovieDto) {
    const result = await this.moviesService.testMovieCreated(createMovieDto);
    return {
      success: true,
      statusCode: 201,
      message: 'Tested movie created successfully',
      result: plainToInstance(MovieResponseDto, result, {
        excludeExtraneousValues: true,
      }),
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
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy danh sách phim (Public)' })
  async findAll(@Query() searchRequest: BaseSearchRequest) {
    const result = await this.moviesService.findAll(searchRequest);
    return {
      success: true,
      statusCode: 200,
      message: 'Get movies successfully',
      result: plainToInstance(MovieResponseDto, result.data, {
        excludeExtraneousValues: true,
      }),
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages,
      },
    };
  }

  // search nâng cao: genres, sortBy, keyword
  @Get('/search')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Tìm kiếm phim (Public)' })
  async search(
    @Query() query: MovieSearchRequestDto,
    @Req() req?: SearchRequest,
  ) {
    const user = req?.user as JwtPayload | undefined;
    const context: SearchEventContext = {
      userId: user?.sub,
      correlationId: req?.correlationId,
      isFirstPage: query.page === undefined || Number(query.page) === 1,
    };
    const { result, pagination } = await this.moviesService.search(
      query,
      context,
    );

    return {
      success: true,
      statusCode: 200,
      message: 'Searched movies successfully',
      result: plainToInstance(MovieResponseDto, result, {
        excludeExtraneousValues: true,
      }),
      pagination,
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
      result: plainToInstance(MovieResponseDto, result, {
        excludeExtraneousValues: true,
      }),
    };
  }

  @Post(':id/view')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tăng lượt xem cho phim và ghi log' })
  async incrementView(
    @Param('id') id: string,
    @Req() req: Request,
    @Body() body?: RecordViewDto,
  ) {
    const user = req.user as JwtPayload | undefined;
    const result = await this.moviesService.incrementViewCount(
      +id,
      user?.sub,
      body?.genres,
    );
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
      result: plainToInstance(MovieResponseDto, result, {
        excludeExtraneousValues: true,
      }),
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
