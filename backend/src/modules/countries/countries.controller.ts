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
import { CountriesService } from './countries.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PaginationDto } from '@/common/dtos/pagination.dto';

@ApiTags('Countries')
@Controller('countries')
export class CountriesController {
  constructor(private readonly countriesService: CountriesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo quốc gia mới (Chỉ dành cho ADMIN)' })
  async create(@Body() createCountryDto: CreateCountryDto) {
    const result = await this.countriesService.create(createCountryDto);

    return {
      success: true,

      statusCode: 201,

      message: 'Success',

      result,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách quốc gia (Public)' })
  async findAll(@Query() paginationDto: PaginationDto) {
    const { data, ...pagination } =
      await this.countriesService.findAll(paginationDto);
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy danh sách quốc gia thành công',
      result: data,
      pagination: pagination,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết quốc gia (Public)' })
  async findOne(@Param('id') id: string) {
    const result = await this.countriesService.findOne(+id);

    return {
      success: true,

      statusCode: 200,

      message: 'Success',

      result,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin quốc gia (Chỉ dành cho ADMIN)' })
  async update(
    @Param('id') id: string,
    @Body() updateCountryDto: UpdateCountryDto,
  ) {
    const result = await this.countriesService.update(+id, updateCountryDto);

    return {
      success: true,

      statusCode: 200,

      message: 'Success',

      result,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá quốc gia (Chỉ dành cho ADMIN)' })
  async remove(@Param('id') id: string) {
    const result = await this.countriesService.remove(+id);

    return {
      success: true,

      statusCode: 200,

      message: 'Success',

      result,
    };
  }
}
