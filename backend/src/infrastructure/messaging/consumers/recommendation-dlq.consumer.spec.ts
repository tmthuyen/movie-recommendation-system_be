import type { Channel, ConsumeMessage } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';

import { FailedEventsService } from '@/modules/failed-events/failed-events.service';
import { FailedEventDto } from '@/modules/failed-events/dtos/failed-event.dto';
import { MESSAGE_BUS_CONFIG } from '../messaging.constants';
import {
  RecommendationConsumer,
  RecommendationHandler,
} from './recommendation-dlq.consumer';

type ChannelMock = {
  assertExchange: jest.Mock;
  assertQueue: jest.Mock;
  bindQueue: jest.Mock;
  consume: jest.Mock;
  ack: jest.Mock;
  nack: jest.Mock;
};

const makeChannel = (): ChannelMock => ({
  assertExchange: jest.fn().mockResolvedValue({}),
  assertQueue: jest.fn().mockResolvedValue({}),
  bindQueue: jest.fn().mockResolvedValue({}),
  consume: jest.fn().mockResolvedValue({ consumerTag: 'tag' }),
  ack: jest.fn(),
  nack: jest.fn(),
});

const makeMessage = (
  event: Record<string, unknown>,
  headers: Record<string, unknown> = {},
): ConsumeMessage =>
  ({
    content: Buffer.from(JSON.stringify(event)),
    properties: { headers },
    fields: { deliveryTag: 1 },
  }) as unknown as ConsumeMessage;

const makeEnvelope = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  eventId: 'evt-1',
  eventType: 'movie.created',
  eventVersion: 1,
  source: 'ai-service',
  occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { movieId: 2 },
  ...overrides,
});

describe('RecommendationHandler', () => {
  let failedEvents: { logFailedEvent: jest.Mock };
  let handler: RecommendationHandler;

  beforeEach(() => {
    failedEvents = { logFailedEvent: jest.fn().mockResolvedValue(undefined) };
    handler = new RecommendationHandler(
      failedEvents as unknown as FailedEventsService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('lưu failed event qua FailedEventsService', async () => {
    const dto: FailedEventDto = {
      source: 'ai-service',
      eventId: 'evt-1',
      eventType: 'movie.created',
      routingKey: 'movie.created',
      queueName: 'recommendation.queue',
      payload: { movieId: 2 },
      errorReason: 'rejected',
      retryCount: 0,
      occurredAt: '2026-01-01T00:00:00.000Z',
    };

    await expect(handler.handleRecommendationDlq(dto)).resolves.toBeUndefined();

    expect(failedEvents.logFailedEvent).toHaveBeenCalledWith(dto);
  });

  it('service lỗi → ném lại để consumer nack message', async () => {
    failedEvents.logFailedEvent.mockRejectedValue(new Error('db down'));

    await expect(
      handler.handleRecommendationDlq({} as FailedEventDto),
    ).rejects.toThrow('db down');
  });
});

describe('RecommendationConsumer', () => {
  let channel: ChannelMock;
  let channelWrapper: { addSetup: jest.Mock };
  let failedEvents: { logFailedEvent: jest.Mock };
  let handler: RecommendationHandler;
  let consumer: RecommendationConsumer;

  beforeEach(() => {
    channel = makeChannel();
    channelWrapper = { addSetup: jest.fn().mockResolvedValue(undefined) };
    failedEvents = { logFailedEvent: jest.fn().mockResolvedValue(undefined) };
    handler = new RecommendationHandler(
      failedEvents as unknown as FailedEventsService,
    );
    consumer = new RecommendationConsumer(
      handler,
      channelWrapper as unknown as ChannelWrapper,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('onModuleInit await addSetup và đăng ký setupConsumer', async () => {
    await expect(consumer.onModuleInit()).resolves.toBeUndefined();

    expect(channelWrapper.addSetup).toHaveBeenCalledTimes(1);
    expect(channelWrapper.addSetup.mock.calls[0][0]).toBeInstanceOf(Function);
  });

  it('setupTopology khai báo exchange/queue/binding của recommendation DLQ', async () => {
    await consumer['setupTopology'](channel as unknown as Channel);

    expect(channel.assertExchange).toHaveBeenCalledWith(
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLX,
      'topic',
      { durable: true },
    );
    expect(channel.assertQueue).toHaveBeenCalledWith(
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ,
      { durable: true },
    );
    expect(channel.bindQueue).toHaveBeenCalledWith(
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ,
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLX,
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ_ROUTING_KEY,
    );
  });

  it('setupConsumer consume đúng queue với noAck=false', async () => {
    await consumer.setupConsumer(channel as unknown as Channel);

    expect(channel.consume).toHaveBeenCalledWith(
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ,
      expect.any(Function),
      { noAck: false },
    );
  });

  it('message null → bỏ qua', async () => {
    await consumer.setupConsumer(channel as unknown as Channel);
    const callback = channel.consume.mock.calls[0][1] as (
      msg: ConsumeMessage | null,
    ) => void;

    callback(null);
    await new Promise(resolve => setImmediate(resolve));

    expect(failedEvents.logFailedEvent).not.toHaveBeenCalled();
    expect(channel.ack).not.toHaveBeenCalled();
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('message hợp lệ → handler lưu DB và ack', async () => {
    const msg = makeMessage(makeEnvelope());

    await consumer['handleMessage'](msg, channel as unknown as Channel);

    expect(failedEvents.logFailedEvent).toHaveBeenCalledTimes(1);
    expect(channel.ack).toHaveBeenCalledWith(msg);
    expect(channel.nack).not.toHaveBeenCalled();
  });

  it('JSON không hợp lệ → nack không requeue', async () => {
    const msg = {
      content: Buffer.from('not-json'),
      properties: { headers: {} },
      fields: {},
    } as unknown as ConsumeMessage;

    await consumer['handleMessage'](msg, channel as unknown as Channel);

    expect(failedEvents.logFailedEvent).not.toHaveBeenCalled();
    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('handler lỗi → nack không requeue', async () => {
    failedEvents.logFailedEvent.mockRejectedValue(new Error('db down'));
    const msg = makeMessage(makeEnvelope());

    await consumer['handleMessage'](msg, channel as unknown as Channel);

    expect(channel.nack).toHaveBeenCalledWith(msg, false, false);
    expect(channel.ack).not.toHaveBeenCalled();
  });

  it('toFailedEvent đọc routing key gốc từ x-death khớp first-death', () => {
    const msg = makeMessage(makeEnvelope(), {
      'x-first-death-queue': 'recommendation.queue',
      'x-first-death-exchange': 'movie.exchange',
      'x-first-death-reason': 'rejected',
      'x-death': [
        {
          queue: 'recommendation.queue.retry.10s',
          exchange: 'movie.exchange.retry.10s',
          reason: 'rejected',
          'routing-keys': ['recommendation.queue.retry.10s.rk'],
        },
        {
          queue: 'recommendation.queue',
          exchange: 'movie.exchange',
          reason: 'rejected',
          'routing-keys': ['movie.created'],
        },
      ],
    });

    const dto = consumer['toFailedEvent'](msg);

    expect(dto).toEqual({
      source: 'ai-service',
      routingKey: 'movie.created',
      queueName: 'recommendation.queue',
      retryCount: 0,
      eventId: 'evt-1',
      eventType: 'movie.created',
      payload: { movieId: 2 },
      errorReason: 'rejected',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('toFailedEvent fallback về eventType và "unknown" khi thiếu header', () => {
    const msg = makeMessage(makeEnvelope({ payload: undefined }));

    const dto = consumer['toFailedEvent'](msg);

    expect(dto.routingKey).toBe('movie.created');
    expect(dto.queueName).toBe('unknown');
    expect(dto.errorReason).toBe('unknown');
    expect(dto.payload).toMatchObject({ eventId: 'evt-1' });
  });

  it('toFailedEvent dùng first-death-queue không khớp x-death', () => {
    const msg = makeMessage(makeEnvelope(), {
      'x-first-death-queue': 'recommendation.queue.other',
      'x-death': [
        {
          queue: 'recommendation.queue.retry.10s',
          exchange: 'movie.exchange.retry.10s',
          'routing-keys': ['other.rk'],
        },
      ],
    });

    const dto = consumer['toFailedEvent'](msg);

    expect(dto.queueName).toBe('recommendation.queue.other');
    expect(dto.routingKey).toBe('movie.created');
  });
});
