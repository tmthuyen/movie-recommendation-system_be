import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseInterceptors,
  ClassSerializerInterceptor,
  UseGuards,
  HttpStatus,
} from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/role.entity';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';

@ApiTags('Roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @UseInterceptors(ClassSerializerInterceptor)
  @Post()
  async create(@Body() createRoleDto: CreateRoleDto) {
    const result = await this.rolesService.create(createRoleDto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'Tạo role thành công',
      result,
    };
  }

  @Get()
  @Roles('ADMIN', 'MANAGER')
  async findAll() {
    const result = await this.rolesService.findAll();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách role thành công',
      result,
    };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const result = await this.rolesService.findOne(+id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin role thành công',
      result,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateRoleDto: UpdateRoleDto) {
    const result = await this.rolesService.update(+id, updateRoleDto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật role thành công',
      result,
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.rolesService.remove(+id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xóa role thành công',
      result,
    };
  }
}
