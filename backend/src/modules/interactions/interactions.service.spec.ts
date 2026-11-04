import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IInteractionRepository } from './interactions.repository';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { EventsGateway } from '@/modules/events/events.gateway';
import { MovieInteractionStatsService } from './movie-interaction-stats.service';
import { RatingsService } from '@/modules/ratings/ratings.service';
import { InteractionsService } from './interactions.service';
import { Interaction, InteractionType } from './entities/interaction.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';

describe('InteractionsService', () => {
  let service: InteractionsService;
  let repo: {
    findAll: jest.Mock;
    findByUser: jest.Mock;
    findById: jest.Mock;
    remove: jest.Mock;
    findAllByUserAndMovie: jest.Mock;
  };
  let manager: {
    findOne: jest.Mock;
    remove: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    increment: jest.Mock;
    decrement: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let statsService: { getStats: jest.Mock };
  let producer: { publishInteractionCreated: jest.Mock };
  let gateway: { broadcastInteraction: jest.Mock };
  let ratingService: { findByUserAndMovie: jest.Mock };

  const stats = {
    movieId: 1,
    likeCount: 3,
    commentCount: 2,
    viewCount: 10,
    ratingCount: 1,
    voteAverage: 4,
  };

  beforeEach(() => {
    manager = {
      findOne: jest.fn(),
      remove: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity, dto) => ({ id: 10, ...dto })),
      save: jest.fn((entity: unknown) => entity),
      increment: jest.fn().mockResolvedValue(undefined),
      decrement: jest.fn().mockResolvedValue(undefined),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };

    repo = {
      findAll: jest.fn(),
      findByUser: jest.fn(),
      findById: jest.fn(),
      remove: jest.fn(),
      findAllByUserAndMovie: jest.fn(),
    };

    statsService = { getStats: jest.fn().mockResolvedValue(stats) };
    producer = { publishInteractionCreated: jest.fn() };
    gateway = { broadcastInteraction: jest.fn() };
    ratingService = { findByUserAndMovie: jest.fn().mockResolvedValue(null) };

    service = new InteractionsService(
      repo as unknown as IInteractionRepository,
      producer as unknown as InteractionProducer,
      statsService as unknown as MovieInteractionStatsService,
      gateway as unknown as EventsGateway,
      dataSource as unknown as DataSource,
      ratingService as unknown as RatingsService,
    );

    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create — toggle like', () => {
    it('chưa like → tạo interaction, tăng likeCount, broadcast + publish added', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 1, likeCount: 2 }) // movie
        .mockResolvedValueOnce(null); // interaction chưa tồn tại

      const res = await service.create('user-1', {
        movieId: 1,
        type: InteractionType.LIKE,
      });

      expect(manager.save).toHaveBeenCalledTimes(1);
      expect(manager.increment).toHaveBeenCalledWith(
        Movie,
        { id: 1 },
        'likeCount',
        1,
      );
      expect(manager.create).toHaveBeenCalledWith(
        Interaction,
        expect.objectContaining({
          type: InteractionType.LIKE,
          movie: { id: 1 },
          user: { id: 'user-1' },
        }),
      );
      expect(gateway.broadcastInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          movieId: 1,
          type: InteractionType.LIKE,
          action: 'added',
          likeCount: 3,
        }),
      );
      expect(producer.publishInteractionCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          movieId: 1,
          action: InteractionType.LIKE,
          removed: false,
        }),
      );
      expect(res).toMatchObject({
        action: 'added',
        type: InteractionType.LIKE,
        likeCount: 3,
      });
      expect(res.data).toBeDefined();
    });

    it('đã like → xoá interaction, giảm likeCount, broadcast removed', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 1, likeCount: 3 })
        .mockResolvedValueOnce({ id: 99, type: InteractionType.LIKE });

      const res = await service.create('user-1', {
        movieId: 1,
        type: InteractionType.LIKE,
      });

      expect(manager.remove).toHaveBeenCalledWith(
        expect.objectContaining({ id: 99 }),
      );
      expect(manager.decrement).toHaveBeenCalledWith(
        Movie,
        { id: 1 },
        'likeCount',
        1,
      );
      expect(manager.increment).not.toHaveBeenCalled();
      expect(gateway.broadcastInteraction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'removed', movieId: 1 }),
      );
      expect(res).toMatchObject({
        action: 'removed',
        type: InteractionType.LIKE,
        likeCount: 3,
      });
      expect(res.data).toBeUndefined();
    });

    it('comment/click không làm thay đổi likeCount', async () => {
      manager.findOne
        .mockResolvedValueOnce({ id: 1, likeCount: 5 })
        .mockResolvedValueOnce(null);

      await service.create('user-1', {
        movieId: 1,
        type: InteractionType.COMMENT,
      });

      expect(manager.increment).not.toHaveBeenCalled();
      expect(manager.decrement).not.toHaveBeenCalled();
    });

    it('phim không tồn tại → NotFoundException, không broadcast', async () => {
      manager.findOne.mockResolvedValueOnce(null);

      await expect(
        service.create('user-1', { movieId: 404, type: InteractionType.LIKE }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(gateway.broadcastInteraction).not.toHaveBeenCalled();
    });
  });

  describe('đọc dữ liệu', () => {
    it('getInteractionsByUserAndMovie tổng hợp isLiked/click/commentCount/rating', async () => {
      repo.findAllByUserAndMovie.mockResolvedValue([
        { type: InteractionType.LIKE },
        { type: InteractionType.CLICK },
        { type: InteractionType.COMMENT },
        { type: InteractionType.COMMENT },
      ]);
      ratingService.findByUserAndMovie.mockResolvedValue({ score: 4 });

      const res = await service.getInteractionsByUserAndMovie('user-1', 1);

      expect(res).toEqual({
        isLiked: true,
        click: true,
        commentCount: 2,
        rating: { score: 4 },
      });
    });

    it('getInteractionsByUserAndMovie trả trạng thái rỗng khi chưa tương tác', async () => {
      repo.findAllByUserAndMovie.mockResolvedValue([]);

      const res = await service.getInteractionsByUserAndMovie('user-1', 1);

      expect(res).toEqual({
        isLiked: false,
        click: false,
        commentCount: 0,
        rating: null,
      });
    });

    it('getMovieStats uỷ quyền cho stats service', async () => {
      await expect(service.getMovieStats(1)).resolves.toEqual(stats);
      expect(statsService.getStats).toHaveBeenCalledWith(1);
    });

    it('findOne ném NotFoundException khi không có bản ghi', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findOne(1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('remove xoá theo id và trả success', async () => {
      repo.findById.mockResolvedValue({ id: 7 });
      repo.remove.mockResolvedValue(undefined);

      await expect(service.remove(7)).resolves.toEqual({ success: true });
      expect(repo.remove).toHaveBeenCalledWith(7);
    });
  });
});
