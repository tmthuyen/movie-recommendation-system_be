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
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

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
  findAll() {
    const result = this.usersService.findAll();
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy danh sách user thành công',
      result,
    };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const result = this.usersService.findOne(+id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin user thành công',
      result,
    };
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    const result = this.usersService.update(+id, updateUserDto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật user thành công',
      result,
    };
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const result = this.usersService.remove(+id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xóa user thành công',
      result,
    };
  }
}
