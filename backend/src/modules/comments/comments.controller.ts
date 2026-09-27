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

@ApiTags('Comments')
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm bình luận mới (Yêu cầu đăng nhập)' })
  create(@Req() req: any, @Body() createCommentDto: CreateCommentDto) {
    const userId = req.user.id;
    return this.commentsService.create(userId, createCommentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy tất cả bình luận (Public)' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.commentsService.findAll(paginationDto);
  }

  @Get('movie/:movieId')
  @ApiOperation({ summary: 'Lấy bình luận của một bộ phim (Public)' })
  findByMovie(
    @Param('movieId') movieId: string,
    @Query() paginationDto: PaginationDto,
  ) {
    return this.commentsService.findByMovie(+movieId, paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết bình luận (Public)' })
  findOne(@Param('id') id: string) {
    return this.commentsService.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật bình luận của mình (Yêu cầu đăng nhập)' })
  update(@Param('id') id: string, @Body() updateCommentDto: UpdateCommentDto) {
    // Note: should check if comment belongs to user
    return this.commentsService.update(+id, updateCommentDto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @Roles('ADMIN', 'SUPERADMIN')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá bình luận (Chỉ dành cho ADMIN)' })
  remove(@Param('id') id: string) {
    return this.commentsService.remove(+id);
  }
}
