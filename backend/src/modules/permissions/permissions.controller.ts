import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
} from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  create(@Body() createPermissionDto: CreatePermissionDto) {
    const result = this.permissionsService.create(createPermissionDto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'Tạo permission thành công',
      result,
    };
  }

  @Get()
  findAll() {
    const result = this.permissionsService.findAll();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách permission thành công',
      result,
    };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const result = this.permissionsService.findOne(+id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin permission thành công',
      result,
    };
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updatePermissionDto: UpdatePermissionDto,
  ) {
    const result = this.permissionsService.update(+id, updatePermissionDto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật permission thành công',
      result,
    };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const result = this.permissionsService.remove(+id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xóa permission thành công',
      result,
    };
  }
}
