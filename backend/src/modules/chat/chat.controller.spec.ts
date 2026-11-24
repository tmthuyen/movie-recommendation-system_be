import { Test, TestingModule } from '@nestjs/testing';
import type { Response as ExpressResponse } from 'express';
import { ChatController } from './chat.controller';
import { IChatService } from './chat.service';

describe('ChatController', () => {
  let controller: ChatController;
  const chatServiceMock = {
    ask: jest.fn(),
    askStream: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: IChatService,
          useValue: chatServiceMock,
        },
      ],
    }).compile();

    controller = module.get<ChatController>(ChatController);
  });

  it('POST /chat trả về đúng envelope chuẩn với answer và movies', async () => {
    const mockResult = {
      answer: 'Gợi ý cho bạn phim Người Nhện.',
      movies: [{ id: 1, title: 'Spider-Man', score: 0.9, rank: 1 }],
    };
    chatServiceMock.ask.mockResolvedValueOnce(mockResult);

    const response = await controller.ask({
      message: 'Phim người nhện',
      topK: 5,
    });

    expect(response).toEqual({
      success: true,
      statusCode: 200,
      message: 'Trả lời câu hỏi thành công.',
      result: mockResult,
    });
    expect(chatServiceMock.ask).toHaveBeenCalledWith({
      message: 'Phim người nhện',
      topK: 5,
    });
  });

  it('POST /chat/stream gọi chatService.askStream', async () => {
    chatServiceMock.askStream.mockResolvedValueOnce(undefined);
    const mockRes = {} as unknown as ExpressResponse;

    await controller.askStream({ message: 'Phim hành động', topK: 5 }, mockRes);

    expect(chatServiceMock.askStream).toHaveBeenCalledWith(
      { message: 'Phim hành động', topK: 5 },
      mockRes,
    );
  });
});
