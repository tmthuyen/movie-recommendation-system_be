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
  UseGuards,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { type Request } from 'express';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Lấy thông tin profile cá nhân' })
  async getProfile(@Req() req: Request) {
    const { sub: userId } = req.user as JwtPayload;
    const result = await this.usersService.findOne(userId);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin profile thành công',
      result,
    };
  }

  @Patch('me')
  @ApiOperation({
    summary: 'Cập nhật thông tin profile cá nhân (kể cả preferences)',
  })
  async updateProfile(
    @Req() req: Request,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    const { sub: userId } = req.user as JwtPayload;
    const result = await this.usersService.update(userId, updateProfileDto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật profile thành công',
      result,
    };
  }

  @Roles('ADMIN', 'SUPERADMIN')
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

  @Roles('ADMIN', 'SUPERADMIN')
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

  @Roles('ADMIN', 'SUPERADMIN')
  @Get(':id')
  async findOne(@Param('id') id: string) {
    const result = await this.usersService.findOne(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Lấy thông tin user thành công',
      result,
    };
  }

  @Roles('ADMIN', 'SUPERADMIN')
  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    const result = await this.usersService.update(id, updateUserDto);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật user thành công',
      result,
    };
  }

  @Roles('ADMIN', 'SUPERADMIN')
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.usersService.remove(id);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Xóa user thành công',
      result,
    };
  }

  @Roles('ADMIN', 'SUPERADMIN')
  @Patch(':id/roles')
  async assignRoles(
    @Param('id') id: string,
    @Body('roleIds') roleIds: number[],
  ) {
    const result = await this.usersService.assignRoles(id, roleIds);
    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Cập nhật role cho user thành công',
      result,
    };
  }
}
