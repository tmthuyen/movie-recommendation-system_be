import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RatingsService } from './ratings.service';
import { IRatingRepository } from './ratings.repository';
import { EventsGateway } from '@/modules/events/events.gateway';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import {
  Interaction,
  InteractionType,
} from '@/modules/interactions/entities/interaction.entity';
import { Rating } from './entities/rating.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';

describe('RatingsService', () => {
  let service: RatingsService;
  let repo: Record<string, jest.Mock>;
  let manager: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let rawQueryBuilder: {
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    getRawOne: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let gateway: Record<string, jest.Mock>;
  let producer: { publishInteractionCreated: jest.Mock };

  beforeEach(() => {
    rawQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ count: '4', average: '3.756' }),
    };

    manager = {
      findOne: jest.fn(),
      create: jest.fn((_entity, dto) => ({ id: 30, ...dto })),
      save: jest.fn((entity: unknown) => ({
        createdAt: new Date('2026-01-01'),
        ...(entity as object),
      })),
      update: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(rawQueryBuilder),
    };

    dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };

    repo = {
      findAll: jest.fn(),
      findByMovie: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      findByUserAndMovie: jest.fn(),
    };
    gateway = { broadcastRating: jest.fn() };
    producer = { publishInteractionCreated: jest.fn() };

    service = new RatingsService(
      repo as unknown as IRatingRepository,
      dataSource as unknown as DataSource,
      gateway as unknown as EventsGateway,
      producer as unknown as InteractionProducer,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    it('chưa có rating → tạo rating + interaction với score = số sao', async () => {
      manager.findOne
        .mockResolvedValueOnce(null) // rating
        .mockResolvedValueOnce(null); // interaction

      const saved = await service.create('user-1', {
        movieId: 3,
        rating: 4,
      });

      expect(manager.create).toHaveBeenCalledWith(
        Rating,
        expect.objectContaining({
          rating: 4,
          movie: { id: 3 },
          user: { id: 'user-1' },
        }),
      );
      expect(manager.create).toHaveBeenCalledWith(
        Interaction,
        expect.objectContaining({
          type: InteractionType.RATING,
          score: 4,
        }),
      );
      expect(saved).toMatchObject({ rating: 4 });
    });

    it('đã có rating → cập nhật rating và interaction (upsert, không tạo mới)', async () => {
      const existingRating = { id: 9, rating: 2, timestamp: new Date(0) };
      const existingInteraction = { id: 19, score: 2 };
      manager.findOne
        .mockResolvedValueOnce(existingRating)
        .mockResolvedValueOnce(existingInteraction);

      await service.create('user-1', { movieId: 3, rating: 5 });

      expect(existingRating.rating).toBe(5);
      expect(existingInteraction.score).toBe(5);
      expect(manager.save).toHaveBeenCalledWith(existingRating);
      expect(manager.save).toHaveBeenCalledWith(existingInteraction);
      expect(manager.create).not.toHaveBeenCalledWith(
        Rating,
        expect.anything(),
      );
    });

    it('tính lại voteCount/voteAverage (làm tròn 2 chữ số) và cập nhật movie', async () => {
      manager.findOne.mockResolvedValue(null);

      await service.create('user-1', { movieId: 3, rating: 4 });

      expect(manager.update).toHaveBeenCalledWith(Movie, 3, {
        voteCount: 4,
        voteAverage: 3.76,
      });
    });

    it('broadcast rating kèm movieStats và publish event sau commit', async () => {
      manager.findOne.mockResolvedValue(null);

      const saved = await service.create('user-1', {
        movieId: 3,
        rating: 4,
      });

      expect(gateway.broadcastRating).toHaveBeenCalledWith(3, {
        ...saved,
        movieStats: { voteCount: 4, voteAverage: 3.76 },
      });
      expect(producer.publishInteractionCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          movieId: 3,
          action: InteractionType.RATING,
          score: 4,
          removed: false,
        }),
      );
      expect(
        gateway.broadcastRating.mock.invocationCallOrder[0],
      ).toBeGreaterThan(dataSource.transaction.mock.invocationCallOrder[0]);
    });
  });

  describe('đọc / sửa / xoá', () => {
    it('findOne ném NotFoundException khi không có rating', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findOne(1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('findByUserAndMovie trả null khi chưa đánh giá', async () => {
      repo.findByUserAndMovie.mockResolvedValue(null);

      await expect(service.findByUserAndMovie('u', 1)).resolves.toBeNull();
    });

    it('remove xoá theo id và trả success', async () => {
      repo.findById.mockResolvedValue({ id: 3 });
      repo.remove.mockResolvedValue(undefined);

      await expect(service.remove(3)).resolves.toEqual({ success: true });
      expect(repo.remove).toHaveBeenCalledWith(3);
    });

    it('findAll chuẩn hoá page/limit và trả {result, pagination}', async () => {
      const data = [{ id: 1 }];
      repo.findAll.mockResolvedValue([data, 11]);

      const result = await service.findAll({ page: 0, limit: 5 });

      expect(repo.findAll).toHaveBeenCalledWith({ page: 1, limit: 5 });
      expect(result).toEqual({
        result: data,
        pagination: { total: 11, page: 1, limit: 5, totalPages: 3 },
      });
    });

    it('findByMovie uỷ quyền cho repository và trả {result, pagination}', async () => {
      repo.findByMovie.mockResolvedValue([[], 0]);

      const result = await service.findByMovie(3, { page: 1, limit: 5 });

      expect(repo.findByMovie).toHaveBeenCalledWith(3, { page: 1, limit: 5 });
      expect(result).toEqual({
        result: [],
        pagination: { total: 0, page: 1, limit: 5, totalPages: 0 },
      });
    });
  });
});
