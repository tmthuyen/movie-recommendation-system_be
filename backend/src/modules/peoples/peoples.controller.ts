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
import { PeoplesService } from './peoples.service';
import { CreatePeopleDto } from './dto/create-people.dto';
import { UpdatePeopleDto } from './dto/update-people.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Roles } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PaginationDto } from '@/common/dtos/pagination.dto';

@ApiTags('Peoples (Diễn viên/Đạo diễn)')
@Controller('peoples')
export class PeoplesController {
  constructor(private readonly peoplesService: PeoplesService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm người mới (Chỉ dành cho ADMIN)' })
  async create(@Body() createPeopleDto: CreatePeopleDto) {
    const result = await this.peoplesService.create(createPeopleDto);
    return {
      success: true,
      statusCode: 201,
      message: 'Tạo thành công',
      result,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách (Public)' })
  async findAll(@Query() paginationDto: PaginationDto) {
    const result = await this.peoplesService.findAll(paginationDto);
    return {
      success: true,
      statusCode: 200,
      message: 'Thành công',
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
  @ApiOperation({ summary: 'Lấy chi tiết (Public)' })
  async findOne(@Param('id') id: string) {
    const result = await this.peoplesService.findOne(+id);
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
  @ApiOperation({ summary: 'Cập nhật thông tin (Chỉ dành cho ADMIN)' })
  async update(
    @Param('id') id: string,
    @Body() updatePeopleDto: UpdatePeopleDto,
  ) {
    const result = await this.peoplesService.update(+id, updatePeopleDto);
    return {
      success: true,
      statusCode: 200,
      message: 'Cập nhật thành công',
      result,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá (Chỉ dành cho ADMIN)' })
  async remove(@Param('id') id: string) {
    const result = await this.peoplesService.remove(+id);
    return {
      success: true,
      statusCode: 200,
      message: 'Xoá thành công',
      result,
    };
  }
}
