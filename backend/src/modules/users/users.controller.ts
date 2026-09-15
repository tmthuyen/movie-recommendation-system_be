import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpStatus,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { PaginationDto } from '@/common/dtos/pagination.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  async create(@Body() createUserDto: CreateUserDto) {
    const result = await this.usersService.create(createUserDto);
    return {
      success: true,
      statusCode: HttpStatus.CREATED,
      message: 'Tạo user thành công',
      result,
    };
  }

  @Get()
  async findAll(@Query() paginationDto: PaginationDto) {
    const result = await this.usersService.findAll(paginationDto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách user thành công',
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
  async findOne(@Param('id') id: string) {
    const result = await this.usersService.findOne(+id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin user thành công',
      result,
    };
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    const result = await this.usersService.update(+id, updateUserDto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật user thành công',
      result,
    };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.usersService.remove(+id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xóa user thành công',
      result,
    };
  }

  @Patch(':id/roles')
  async assignRoles(
    @Param('id') id: string,
    @Body('roleIds') roleIds: number[],
  ) {
    const result = await this.usersService.assignRoles(+id, roleIds);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật role cho user thành công',
      result,
    };
  }
}
