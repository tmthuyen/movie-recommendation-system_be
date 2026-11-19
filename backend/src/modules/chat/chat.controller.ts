import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiResponse } from '@/common/dtos/api-response.dto';
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
}
