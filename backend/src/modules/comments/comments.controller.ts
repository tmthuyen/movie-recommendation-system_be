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
  Req,
} from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';
import type { Request } from 'express';

@ApiTags('Comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm bình luận mới (Yêu cầu đăng nhập)' })
  async create(
    @Req() req: Request,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    const { sub } = req.user as JwtPayload;
    return await this.commentsService.create(sub, createCommentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy tất cả bình luận (Public)' })
  async findAll(@Query() paginationDto: PaginationDto) {
    return await this.commentsService.findAll(paginationDto);
  }

  @Get('movie/:movieId')
  @ApiOperation({ summary: 'Lấy bình luận của một bộ phim (có phân cấp)' })
  async findByMovie(
    @Param('movieId') movieId: string,
    @Query() paginationDto: PaginationDto,
    @Query('parentId') parentId?: string,
  ) {
    return await this.commentsService.findByMovie(
      +movieId,
      paginationDto,
      parentId ? +parentId : undefined,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết bình luận (Public)' })
  async findOne(@Param('id') id: string) {
    return await this.commentsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật bình luận của mình (Yêu cầu đăng nhập)' })
  async update(
    @Param('id') id: string,
    @Body() updateCommentDto: UpdateCommentDto,
  ) {
    // Note: should check if comment belongs to user
    return await this.commentsService.update(+id, updateCommentDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá bình luận (Chỉ dành cho ADMIN)' })
  async remove(@Param('id') id: string) {
    return await this.commentsService.remove(+id);
  }
}
