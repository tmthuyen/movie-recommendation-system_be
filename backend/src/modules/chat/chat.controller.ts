import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';
import { ApiResponse } from '@/common/dtos/api-response.dto';
import { Public } from '@/common/decorators/public.decorator';
import { RateLimit } from '@/common/rate-limit/rate-limit.decorator';
import { IChatService } from './chat.service';
import { ChatRagResponseDto, ChatRequestDto } from './dtos/chat.dto';

@ApiTags('chat')
@Controller('chat')
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    @Inject(IChatService)
    private readonly chatService: IChatService,
  ) {}

  @Public()
  @RateLimit({
    strategy: 'sliding-window',
    type: 'ip',
    limit: 10,
    windowMs: 60000,
    errorMessage:
      'Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi 1 phút trước khi hỏi tiếp để tránh spam hệ thống.',
  })
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hỏi trợ lý phim AI (Chatbot RAG cơ bản)',
  })
  async ask(
    @Body() dto: ChatRequestDto,
  ): Promise<ApiResponse<ChatRagResponseDto>> {
    this.logger.log(`Nhận yêu cầu chat RAG: topK=${dto.topK ?? 5}`);
    const result = await this.chatService.ask(dto);

    return {
      success: true,
      statusCode: HttpStatus.OK,
      message: 'Trả lời câu hỏi thành công.',
      result,
    };
  }

  @Public()
  @RateLimit({
    strategy: 'sliding-window',
    type: 'ip',
    limit: 10,
    windowMs: 60000,
    errorMessage:
      'Bạn đang gửi tin nhắn quá nhanh. Vui lòng đợi 1 phút trước khi hỏi tiếp để tránh spam hệ thống.',
  })
  @Post('stream')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hỏi trợ lý phim AI dạng Server-Sent Events (SSE Stream)',
  })
  async askStream(
    @Body() dto: ChatRequestDto,
    @Res() res: ExpressResponse,
  ): Promise<void> {
    this.logger.log(`Nhận yêu cầu chat RAG Stream: topK=${dto.topK ?? 5}`);
    await this.chatService.askStream(dto, res);
  }
}
