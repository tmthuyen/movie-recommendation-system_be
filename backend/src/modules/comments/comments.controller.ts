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
import {
  ApiResponse,
  ApiResponseWithPagination,
} from '@/common/dtos/api-response.dto';
import { Comment } from '@/modules/comments/entities/comment.entity';

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
    const result = await this.commentsService.create(sub, createCommentDto);

    return {
      success: true,

      statusCode: 201,

      message: 'Success',

      result,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Lấy tất cả bình luận (Public)' })
  async findAll(
    @Query() paginationDto: PaginationDto,
  ): Promise<ApiResponseWithPagination<Comment[]>> {
    const comments = await this.commentsService.findAll(paginationDto);
    const { data, ...pagination } = comments;
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy danh sách bình luận thành công',
      result: data,
      pagination: pagination,
    };
  }

  @Get('movie/:movieId')
  @ApiOperation({ summary: 'Lấy bình luận của một bộ phim (có phân cấp)' })
  async findByMovie(
    @Param('movieId') movieId: string,
    @Query() paginationDto: PaginationDto,
    @Query('parentId') parentId?: string,
  ) {
    const result = await this.commentsService.findByMovie(
      +movieId,
      paginationDto,
      parentId ? +parentId : undefined,
    );

    return {
      success: true,

      statusCode: 200,

      message: 'Success',

      result: result.data || result,

      pagination:
        result.total !== undefined
          ? {
              total: result.total,

              page: result.page,

              limit: result.limit,

              totalPages: result.totalPages,
            }
          : undefined,
    };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết bình luận (Public)' })
  async findOne(@Param('id') id: string) {
    const result = await this.commentsService.findOne(+id);

    return {
      success: true,

      statusCode: 200,

      message: 'Success',

      result,
    };
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
    const result = await this.commentsService.update(+id, updateCommentDto);

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
  @ApiOperation({ summary: 'Xoá bình luận (Chỉ dành cho ADMIN)' })
  async remove(@Param('id') id: string) {
    const result = await this.commentsService.remove(+id);

    return {
      success: true,

      statusCode: 200,

      message: 'Success',

      result,
    };
  }
}
