import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Query,
} from '@nestjs/common';
import { InteractionsService } from './interactions.service';
import { CreateInteractionDto } from './dto/create-interaction.dto';
import { UpdateInteractionDto } from './dto/update-interaction.dto';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PaginationDto } from '@/common/dtos/pagination.dto';

@ApiTags('Interactions')
@Controller('interactions')
export class InteractionsController {
  constructor(private readonly interactionsService: InteractionsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Thêm tương tác mới (Yêu cầu đăng nhập)' })
  create(@Req() req: any, @Body() createInteractionDto: CreateInteractionDto) {
    const userId = req.user.id;
    return this.interactionsService.create(userId, createInteractionDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lấy tất cả tương tác (Public)' })
  findAll(@Query() paginationDto: PaginationDto) {
    return this.interactionsService.findAll(paginationDto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lấy chi tiết tương tác (Public)' })
  findOne(@Param('id') id: string) {
    return this.interactionsService.findOne(+id);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xoá tương tác (Yêu cầu đăng nhập)' })
  remove(@Param('id') id: string) {
    return this.interactionsService.remove(+id);
  }
}
