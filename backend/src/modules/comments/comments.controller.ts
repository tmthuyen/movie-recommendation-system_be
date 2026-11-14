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
import { JwtPayload } from '@/common/interfaces/jwt-payload.interface';
import type { Request } from 'express';
import { ApiResponseWithPagination } from '@/common/dtos/api-response.dto';
import { Comment } from '@/modules/comments/entities/comment.entity';
import { QueryCommentDto } from '@/modules/comments/dto/query-comment.dto';

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
    @Query() searchRequest: QueryCommentDto,
  ): Promise<ApiResponseWithPagination<Comment[]>> {
    const { result, pagination } =
      await this.commentsService.findAll(searchRequest);
    return {
      success: true,
      statusCode: 200,
      message: 'Lấy danh sách bình luận thành công',
      result,
      pagination,
    };
  }

  @Get('movie/:movieId')
  @ApiOperation({ summary: 'Lấy bình luận của một bộ phim (có phân cấp)' })
  async findByMovie(
    @Param('movieId') movieId: string,
    @Query() query: QueryCommentDto,
  ) {
    const { result, pagination } = await this.commentsService.findByMovie(
      +movieId,
      query,
      query.parentId,
    );

    return {
      success: true,

      statusCode: 200,

      message: 'Success',

      result,

      pagination,
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
    @Req() req: Request,
    @Param('id') id: string,
    @Body() updateCommentDto: UpdateCommentDto,
  ) {
    const { sub: userId } = req.user as JwtPayload;

    // Note: should check if comment belongs to user
    const result = await this.commentsService.update(
      +id,
      userId,
      updateCommentDto,
    );

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
