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
import { GenresService } from './genres.service';
import { CreateGenreDto } from './dto/create-genre.dto';
import { UpdateGenreDto } from './dto/update-genre.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PaginationDto } from '@/common/dtos/pagination.dto';

@ApiTags('Genres')
@Controller('genres')
export class GenresController {
  constructor(private readonly genresService: GenresService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo thể loại mới (Chỉ dành cho ADMIN)' })
  async create(@Body() createGenreDto: CreateGenreDto) {
    const result = await this.genresService.create(createGenreDto);
    return {
      success: true,
      statusCode: 201,
      message: 'Thành công',
      result,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách thể loại (Public)' })
  async findAll(@Query() paginationDto: PaginationDto) {
    const { data, ...pagination } =
      await this.genresService.findAll(paginationDto);
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy danh sách thể loại thành công',
      result: data,
      pagination: pagination,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết thể loại (Public)' })
  async findOne(@Param('id') id: string) {
    const result = await this.genresService.findOne(+id);
    return {
      success: true,
      statusCode: 200,
      message: 'Thành công',
      result,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thể loại (Chỉ dành cho ADMIN)' })
  async update(
    @Param('id') id: string,
    @Body() updateGenreDto: UpdateGenreDto,
  ) {
    const result = await this.genresService.update(+id, updateGenreDto);
    return {
      success: true,
      statusCode: 200,
      message: 'Thành công',
      result,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá thể loại (Chỉ dành cho ADMIN)' })
  async remove(@Param('id') id: string) {
    const result = await this.genresService.remove(+id);
    return {
      success: true,
      statusCode: 200,
      message: 'Thành công',
      result,
    };
  }
}
