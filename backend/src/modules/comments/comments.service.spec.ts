import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CommentsService } from './comments.service';
import { ICommentRepository } from './comments.repository';
import { EventsGateway } from '@/modules/events/events.gateway';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { MovieInteractionStatsService } from '@/modules/interactions/movie-interaction-stats.service';
import {
  Interaction,
  InteractionType,
} from '@/modules/interactions/entities/interaction.entity';
import { Comment } from './entities/comment.entity';

describe('CommentsService', () => {
  let service: CommentsService;
  let repo: Record<string, jest.Mock>;
  let manager: {
    create: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let gateway: Record<string, jest.Mock>;
  let producer: { publishInteractionCreated: jest.Mock };
  let statsService: { getStats: jest.Mock };

  const stats = { likeCount: 1, commentCount: 4, viewCount: 7 };

  beforeEach(() => {
    manager = {
      create: jest.fn((_entity, dto) => ({ ...dto })),
      save: jest.fn((entity: unknown) => ({
        id: 21,
        createdAt: new Date('2026-01-01'),
        ...(entity as object),
      })),
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
    };
    gateway = {
      broadcastComment: jest.fn(),
      broadcastInteraction: jest.fn(),
    };
    producer = { publishInteractionCreated: jest.fn() };
    statsService = { getStats: jest.fn().mockResolvedValue(stats) };

    service = new CommentsService(
      repo as unknown as ICommentRepository,
      dataSource as unknown as DataSource,
      gateway as unknown as EventsGateway,
      producer as unknown as InteractionProducer,
      statsService as unknown as MovieInteractionStatsService,
    );
    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    it('tạo comment + interaction comment (score 0 — implicit feedback) trong 1 transaction', async () => {
      await service.create('user-1', {
        movieId: 3,
        content: 'Phim hay',
      });

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(manager.create).toHaveBeenCalledWith(
        Comment,
        expect.objectContaining({
          content: 'Phim hay',
          movie: { id: 3 },
          user: { id: 'user-1' },
        }),
      );
      expect(manager.create).toHaveBeenCalledWith(
        Interaction,
        expect.objectContaining({
          type: InteractionType.COMMENT,
          score: 0,
          movie: { id: 3 },
          user: { id: 'user-1' },
        }),
      );
    });

    it('broadcast comment + interaction và publish event SAU commit', async () => {
      const saved = await service.create('user-1', {
        movieId: 3,
        content: 'Phim hay',
      });

      const transactionOrder =
        dataSource.transaction.mock.invocationCallOrder[0];
      expect(gateway.broadcastComment).toHaveBeenCalledWith(3, saved);
      expect(gateway.broadcastInteraction).toHaveBeenCalledWith(
        expect.objectContaining({
          movieId: 3,
          type: InteractionType.COMMENT,
          action: 'added',
          score: 0,
          likeCount: 1,
          commentCount: 4,
          viewCount: 7,
        }),
      );
      expect(producer.publishInteractionCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          movieId: 3,
          action: InteractionType.COMMENT,
          score: null,
          removed: false,
        }),
      );
      expect(
        gateway.broadcastComment.mock.invocationCallOrder[0],
      ).toBeGreaterThan(transactionOrder);
    });

    it('giữ parentId khi trả lời bình luận', async () => {
      await service.create('user-1', {
        movieId: 3,
        content: 'Reply',
        parentId: 7,
      });

      expect(manager.create).toHaveBeenCalledWith(
        Comment,
        expect.objectContaining({ parentId: 7 }),
      );
    });
  });

  describe('đọc / sửa / xoá', () => {
    it('findByMovie uỷ quyền kèm parentId', async () => {
      repo.findByMovie.mockResolvedValue({ data: [], meta: {} });

      await service.findByMovie(3, { page: 1, limit: 10 }, 2);

      expect(repo.findByMovie).toHaveBeenCalledWith(
        3,
        { page: 1, limit: 10 },
        2,
      );
    });

    it('findOne ném NotFoundException khi không có comment', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.findOne(1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('update dùng id của comment đã tồn tại', async () => {
      repo.findById.mockResolvedValue({ id: 5 });
      repo.update.mockResolvedValue({ id: 5, content: 'mới' });

      await expect(service.update(5, { content: 'mới' })).resolves.toEqual({
        id: 5,
        content: 'mới',
      });
      expect(repo.update).toHaveBeenCalledWith(5, { content: 'mới' });
    });

    it('remove xoá theo id và trả success', async () => {
      repo.findById.mockResolvedValue({ id: 5 });
      repo.remove.mockResolvedValue(undefined);

      await expect(service.remove(5)).resolves.toEqual({ success: true });
      expect(repo.remove).toHaveBeenCalledWith(5);
    });
  });
});
