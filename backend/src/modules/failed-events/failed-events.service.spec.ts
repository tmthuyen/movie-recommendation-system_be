import { NotFoundException } from '@nestjs/common';

import { FailedEventsService } from './failed-events.service';
import { IFailedEventRepository } from './failed-events.repository';
import { EventPublisherService } from '@/infrastructure/messaging/event-publisher.service';
import { MESSAGE_BUS_CONFIG } from '@/infrastructure/messaging/messaging.constants';
import { FailedEvent, FailedEventStatus } from './entities/failed-event.entity';

describe('FailedEventsService', () => {
  let service: FailedEventsService;
  let repo: {
    save: jest.Mock;
    findById: jest.Mock;
    search: jest.Mock;
  };
  let publisher: { publish: jest.Mock };

  const makeFailedEvent = (overrides: Partial<FailedEvent> = {}): FailedEvent =>
    ({
      id: 'fe-1',
      source: 'backend-service',
      queueName: 'movie.queue',
      routingKey: 'movie.created',
      eventId: 'evt-1',
      eventType: 'movie.created',
      correlationId: 'corr-1',
      payload: { movieId: 1 },
      errorReason: 'boom',
      status: FailedEventStatus.PENDING,
      retryCount: 2,
      ...overrides,
    }) as FailedEvent;

  beforeEach(() => {
    repo = {
      save: jest.fn((event: Partial<FailedEvent>) => event as FailedEvent),
      findById: jest.fn(),
      search: jest.fn(),
    };
    publisher = { publish: jest.fn() };

    service = new FailedEventsService(
      repo,
      publisher as unknown as EventPublisherService,
    );

    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('findAll', () => {
    it('merge status cũ vào filters và trả {result, pagination}', async () => {
      const data = [makeFailedEvent()];
      repo.search.mockResolvedValue([data, 25]);

      const result = await service.findAll({
        page: 1,
        limit: 10,
        status: FailedEventStatus.PENDING,
      });

      expect(repo.search).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        status: FailedEventStatus.PENDING,
        filters: ['status:eq:PENDING'],
      });
      expect(result).toEqual({
        result: data,
        pagination: { total: 25, page: 1, limit: 10, totalPages: 3 },
      });
    });

    it('không nhân đôi filter status nếu client đã truyền filters', async () => {
      repo.search.mockResolvedValue([[], 0]);

      const result = await service.findAll({
        page: 0,
        limit: 500,
        status: FailedEventStatus.PENDING,
        filters: ['status:eq:PENDING'],
      });

      expect(repo.search).toHaveBeenCalledWith({
        page: 1,
        limit: 100,
        status: FailedEventStatus.PENDING,
        filters: ['status:eq:PENDING'],
      });
      expect(result.pagination.totalPages).toBe(0);
    });

    it('không truyền status → filters rỗng', async () => {
      repo.search.mockResolvedValue([[], 0]);

      await service.findAll({});

      expect(repo.search).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        filters: [],
      });
    });
  });

  describe('retry', () => {
    it('không tìm thấy failed event → NotFoundException, không publish', async () => {
      repo.findById.mockResolvedValue(null);

      await expect(service.retry('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.retry('missing-id')).rejects.toThrow(
        'Không tìm thấy failed event',
      );

      expect(publisher.publish).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('publish lại thành công (routing movie.*) → MOVIE_EXCHANGE, status RETRIED_SUCCESS', async () => {
      const failedEvent = makeFailedEvent();
      repo.findById.mockResolvedValue(failedEvent);

      await expect(service.retry('fe-1')).resolves.toBe(true);

      expect(publisher.publish).toHaveBeenCalledWith(
        MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE,
        'movie.created',
        { movieId: 1 },
        'corr-1',
      );
      expect(repo.save).toHaveBeenCalledWith(failedEvent);
      expect(failedEvent.status).toBe(FailedEventStatus.RETRIED_SUCCESS);
      expect(failedEvent.retryCount).toBe(3);
    });

    it('routing user.* → publish sang USER_EXCHANGE', async () => {
      const failedEvent = makeFailedEvent({
        routingKey: 'user.created',
        eventType: 'user.created',
        payload: { userId: 'u1' },
      });
      repo.findById.mockResolvedValue(failedEvent);

      await expect(service.retry('fe-1')).resolves.toBe(true);

      expect(publisher.publish).toHaveBeenCalledWith(
        MESSAGE_BUS_CONFIG.USER_EXCHANGE,
        'user.created',
        { userId: 'u1' },
        'corr-1',
      );
    });

    it('publish lỗi → status RETRIED_FAILED, lưu errorReason, trả false (không ném)', async () => {
      const failedEvent = makeFailedEvent();
      repo.findById.mockResolvedValue(failedEvent);
      publisher.publish.mockImplementation(() => {
        throw new Error('channel closed');
      });

      await expect(service.retry('fe-1')).resolves.toBe(false);

      expect(failedEvent.status).toBe(FailedEventStatus.RETRIED_FAILED);
      expect(failedEvent.retryCount).toBe(3);
      expect(failedEvent.errorReason).toBe('channel closed');
      expect(repo.save).toHaveBeenCalledWith(failedEvent);
    });

    it('lỗi không phải Error → errorReason rỗng nhưng vẫn đánh dấu RETRIED_FAILED', async () => {
      const failedEvent = makeFailedEvent();
      repo.findById.mockResolvedValue(failedEvent);
      publisher.publish.mockImplementation(() => {
        // Ném lỗi không phải Error để kiểm tra nhánh `instanceof Error`.
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- cố ý ném non-Error để test nhánh fallback
        throw 'string-error';
      });

      await expect(service.retry('fe-1')).resolves.toBe(false);

      expect(failedEvent.status).toBe(FailedEventStatus.RETRIED_FAILED);
      expect(failedEvent.errorReason).toBe('');
    });
  });

  describe('logFailedEvent', () => {
    it('lưu event mới với status PENDING và retryCount = 0', async () => {
      const saved = makeFailedEvent({ retryCount: 0 });
      repo.save.mockResolvedValue(saved);

      const dto = {
        source: 'backend-service',
        eventId: 'evt-9',
        eventType: 'movie.created',
        routingKey: 'movie.created',
        queueName: 'movie.queue',
        correlationId: 'corr-9',
        payload: { movieId: 9 },
        errorReason: 'boom',
        // DTO có retryCount nhưng service phải ghi đè về 0 cho bản ghi mới.
        retryCount: 5,
        occurredAt: new Date().toISOString(),
      };

      await expect(service.logFailedEvent(dto)).resolves.toBe(saved);

      expect(repo.save).toHaveBeenCalledWith({
        ...dto,
        status: FailedEventStatus.PENDING,
        retryCount: 0,
      });
    });
  });
});
