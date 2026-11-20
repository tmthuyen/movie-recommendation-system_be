import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AppException } from '@/common/custom-exception/app-exception';
import { MoviesService } from '@/modules/movies/movies.service';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;
  const moviesServiceMock = {
    findByIds: jest.fn(),
  };

  const dataSourceMock = {
    getRepository: jest.fn(),
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
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
      ],
    }).compile();

    service = module.get<ChatService>(ChatService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('trả về câu trả lời và danh sách phim đã hydrate từ DB khi intent là MOVIE_SEARCH_RAG', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          statusCode: 200,
          message: 'OK',
          result: {
            intent: 'MOVIE_SEARCH_RAG',
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
    expect(res.intent).toBe('MOVIE_SEARCH_RAG');
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

  it('xử lý nhánh CHITCHAT: trả về câu trả lời chào hỏi và không gọi hydrate phim', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          statusCode: 200,
          message: 'OK',
          result: {
            intent: 'CHITCHAT',
            answer: 'Xin chào! Tôi là Moviere AI.',
            movies: [],
          },
        }),
    } as Response);

    const res = await service.ask({ message: 'Xin chào' });

    expect(res.intent).toBe('CHITCHAT');
    expect(res.answer).toBe('Xin chào! Tôi là Moviere AI.');
    expect(res.movies).toEqual([]);
    expect(moviesServiceMock.findByIds).not.toHaveBeenCalled();
  });

  it('xử lý nhánh OUT_OF_SCOPE: từ chối lịch sự và không gọi hydrate phim', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          statusCode: 200,
          message: 'OK',
          result: {
            intent: 'OUT_OF_SCOPE',
            answer: 'Tôi là Moviere AI, chỉ trả lời về phim ảnh.',
            movies: [],
          },
        }),
    } as Response);

    const res = await service.ask({ message: 'Viết code python giải bài toán' });

    expect(res.intent).toBe('OUT_OF_SCOPE');
    expect(res.answer).toContain('chỉ trả lời về phim ảnh');
    expect(res.movies).toEqual([]);
    expect(moviesServiceMock.findByIds).not.toHaveBeenCalled();
  });

  it('xử lý nhánh SYSTEM_STATS (most_commented): truy vấn DB và trả về danh sách phim nhiều bình luận nhất', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          statusCode: 200,
          message: 'OK',
          result: {
            intent: 'SYSTEM_STATS',
            statType: 'most_commented',
            answer: 'Đang tổng hợp...',
            movies: [],
          },
        }),
    } as Response);

    const qbMock = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValueOnce([
        { movieId: 10, count: '15' },
        { movieId: 20, count: '8' },
      ]),
    };

    dataSourceMock.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    });

    moviesServiceMock.findByIds.mockResolvedValueOnce([
      { id: 10, title: 'Spider-Man', titleVi: 'Người Nhện' },
      { id: 20, title: 'Inception', titleVi: 'Kẻ Đánh Cắp Giấc Mơ' },
    ]);

    const res = await service.ask({ message: 'Phim nào nhiều comment nhất?' });

    expect(res.intent).toBe('SYSTEM_STATS');
    expect(res.statType).toBe('most_commented');
    expect(res.answer).toContain('Người Nhện');
    expect(res.answer).toContain('15 bình luận');
    expect(res.movies).toHaveLength(2);
    expect(moviesServiceMock.findByIds).toHaveBeenCalledWith([10, 20]);
  });

  it('xử lý nhánh SYSTEM_STATS (top_rated): truy vấn DB và trả về phim điểm đánh giá cao nhất', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          statusCode: 200,
          message: 'OK',
          result: {
            intent: 'SYSTEM_STATS',
            statType: 'top_rated',
            answer: 'Đang tổng hợp...',
            movies: [],
          },
        }),
    } as Response);

    const qbMock = {
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValueOnce([
        {
          id: 10,
          title: 'The Dark Knight',
          titleVi: 'Kỵ Sĩ Bóng Đêm',
          voteAverage: 9.0,
          voteCount: 1200,
        },
      ]),
    };

    dataSourceMock.getRepository.mockReturnValue({
      createQueryBuilder: jest.fn().mockReturnValue(qbMock),
    });

    const res = await service.ask({ message: 'Phim nào rating cao nhất?' });

    expect(res.intent).toBe('SYSTEM_STATS');
    expect(res.statType).toBe('top_rated');
    expect(res.answer).toContain('Kỵ Sĩ Bóng Đêm');
    expect(res.answer).toContain('9.0/10');
    expect(res.movies).toHaveLength(1);
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
