import { Test, TestingModule } from '@nestjs/testing';
import { AppException } from '@/common/custom-exception/app-exception';
import { MoviesService } from '@/modules/movies/movies.service';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  const moviesServiceMock = {
    findByIds: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        {
          provide: MoviesService,
          useValue: moviesServiceMock,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('trả về câu trả lời và danh sách phim đã hydrate từ DB', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          statusCode: 200,
          message: 'OK',
          result: {
            answer: 'Bạn nên xem Người Nhện.',
            movies: [{ id: 10, similarityScore: 0.91, rank: 1 }],
          },
        }),
    } as Response);

    moviesServiceMock.findByIds.mockResolvedValueOnce([
      {
        id: 10,
        title: 'Spider-Man',
        titleVi: 'Người Nhện',
        posterPath: '/spider.jpg',
      },
    ]);

    const res = await service.ask({ message: 'Tìm phim người nhện', topK: 5 });

    expect(res.answer).toBe('Bạn nên xem Người Nhện.');
    expect(res.movies).toHaveLength(1);
    expect(res.movies[0]).toMatchObject({
      id: 10,
      title: 'Spider-Man',
      titleVi: 'Người Nhện',
      score: 0.91,
      rank: 1,
    });
    expect(moviesServiceMock.findByIds).toHaveBeenCalledWith([10]);
  });

  it('trả về danh sách phim rỗng khi ai-service không tìm thấy phim', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          statusCode: 200,
          message: 'OK',
          result: {
            answer: 'Không tìm thấy phim phù hợp.',
            movies: [],
          },
        }),
    } as Response);

    const res = await service.ask({ message: 'xyz' });

    expect(res.answer).toBe('Không tìm thấy phim phù hợp.');
    expect(res.movies).toEqual([]);
    expect(moviesServiceMock.findByIds).not.toHaveBeenCalled();
  });

  it('ném AppException tiếng Việt khi không kết nối được ai-service', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('Connection refused'));

    await expect(
      service.ask({ message: 'Phim hành động' }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('ném AppException khi ai-service trả mã lỗi HTTP >= 500', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(
      service.ask({ message: 'Phim hành động' }),
    ).rejects.toBeInstanceOf(AppException);
  });
});
