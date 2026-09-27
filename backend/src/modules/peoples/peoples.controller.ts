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
  create(@Body() createPeopleDto: CreatePeopleDto) {
    return this.peoplesService.create(createPeopleDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy danh sách (Public)' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.peoplesService.findAll(paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết (Public)' })
  findOne(@Param('id') id: string) {
    return this.peoplesService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật thông tin (Chỉ dành cho ADMIN)' })
  update(@Param('id') id: string, @Body() updatePeopleDto: UpdatePeopleDto) {
    return this.peoplesService.update(+id, updatePeopleDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá (Chỉ dành cho ADMIN)' })
  remove(@Param('id') id: string) {
    return this.peoplesService.remove(+id);
  }
}
