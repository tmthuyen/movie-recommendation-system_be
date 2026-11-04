import type { Channel, ConsumeMessage } from 'amqplib';
import type { ChannelWrapper } from 'amqp-connection-manager';

import { FailedEventsService } from '@/modules/failed-events/failed-events.service';
import { FailedEventDto } from '@/modules/failed-events/dtos/failed-event.dto';
import { MESSAGE_BUS_CONFIG } from '../messaging.constants';
import {
  InteractionConsumer,
  InteractionHandler,
} from './interaction-dlq.consumer';

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
  eventType: 'interaction.created',
  eventVersion: 1,
  source: 'ai-service',
  occurredAt: '2026-01-01T00:00:00.000Z',
  payload: { userId: 'u1', movieId: 2 },
  ...overrides,
});

describe('InteractionHandler', () => {
  let failedEvents: { logFailedEvent: jest.Mock };
  let handler: InteractionHandler;

  beforeEach(() => {
    failedEvents = { logFailedEvent: jest.fn().mockResolvedValue(undefined) };
    handler = new InteractionHandler(
      failedEvents as unknown as FailedEventsService,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('lưu failed event qua FailedEventsService', async () => {
    const dto: FailedEventDto = {
      source: 'ai-service',
      eventId: 'evt-1',
      eventType: 'interaction.created',
      routingKey: 'interaction.event',
      queueName: 'interaction.queue',
      payload: { userId: 'u1' },
      errorReason: 'rejected',
      retryCount: 0,
      occurredAt: '2026-01-01T00:00:00.000Z',
    };

    await expect(handler.handleInteractionDlq(dto)).resolves.toBeUndefined();

    expect(failedEvents.logFailedEvent).toHaveBeenCalledWith(dto);
  });

  it('service lỗi → ném lại để consumer nack message', async () => {
    failedEvents.logFailedEvent.mockRejectedValue(new Error('db down'));

    await expect(
      handler.handleInteractionDlq({} as FailedEventDto),
    ).rejects.toThrow('db down');
  });
});

describe('InteractionConsumer', () => {
  let channel: ChannelMock;
  let channelWrapper: { addSetup: jest.Mock };
  let failedEvents: { logFailedEvent: jest.Mock };
  let handler: InteractionHandler;
  let consumer: InteractionConsumer;

  beforeEach(() => {
    channel = makeChannel();
    channelWrapper = { addSetup: jest.fn().mockResolvedValue(undefined) };
    failedEvents = { logFailedEvent: jest.fn().mockResolvedValue(undefined) };
    handler = new InteractionHandler(
      failedEvents as unknown as FailedEventsService,
    );
    consumer = new InteractionConsumer(
      handler,
      channelWrapper as unknown as ChannelWrapper,
    );
  });

  afterEach(() => jest.restoreAllMocks());

  it('onModuleInit đăng ký setupConsumer với channel wrapper', () => {
    consumer.onModuleInit();

    expect(channelWrapper.addSetup).toHaveBeenCalledTimes(1);
    expect(channelWrapper.addSetup.mock.calls[0][0]).toBeInstanceOf(Function);
  });

  it('setupTopology khai báo exchange/queue/binding của interaction DLQ', async () => {
    await consumer['setupTopology'](channel as unknown as Channel);

    expect(channel.assertExchange).toHaveBeenCalledWith(
      MESSAGE_BUS_CONFIG.INTERACTION_DLX,
      'topic',
      { durable: true },
    );
    expect(channel.assertQueue).toHaveBeenCalledWith(
      MESSAGE_BUS_CONFIG.INTERACTION_DLQ,
      { durable: true },
    );
    expect(channel.bindQueue).toHaveBeenCalledWith(
      MESSAGE_BUS_CONFIG.INTERACTION_DLQ,
      MESSAGE_BUS_CONFIG.INTERACTION_DLX,
      MESSAGE_BUS_CONFIG.INTERACTION_DLQ_ROUTING_KEY,
    );
  });

  it('setupConsumer tạo topology rồi consume DLQ với noAck=false', async () => {
    await consumer.setupConsumer(channel as unknown as Channel);

    expect(channel.consume).toHaveBeenCalledWith(
      MESSAGE_BUS_CONFIG.INTERACTION_DLQ,
      expect.any(Function),
      { noAck: false },
    );
  });

  it('message null → bỏ qua, không gọi handler', async () => {
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

  it('JSON không hợp lệ → nack không requeue và không gọi handler', async () => {
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
      'x-first-death-queue': 'interaction.queue',
      'x-first-death-exchange': 'interaction.exchange',
      'x-first-death-reason': 'rejected',
      'x-death': [
        {
          queue: 'interaction.queue.retry.10s',
          exchange: 'interaction.exchange.retry.10s',
          reason: 'rejected',
          'routing-keys': ['interaction.queue.retry.10s.rk'],
        },
        {
          queue: 'interaction.queue',
          exchange: 'interaction.exchange',
          reason: 'rejected',
          'routing-keys': ['interaction.event'],
        },
      ],
    });

    const dto = consumer['toFailedEvent'](msg);

    expect(dto).toEqual({
      source: 'ai-service',
      routingKey: 'interaction.event',
      queueName: 'interaction.queue',
      retryCount: 0,
      eventId: 'evt-1',
      eventType: 'interaction.created',
      payload: { userId: 'u1', movieId: 2 },
      errorReason: 'rejected',
      occurredAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('toFailedEvent fallback về eventType và "unknown" khi thiếu header', () => {
    const msg = makeMessage(makeEnvelope({ payload: undefined }));

    const dto = consumer['toFailedEvent'](msg);

    expect(dto.routingKey).toBe('interaction.created');
    expect(dto.queueName).toBe('unknown');
    expect(dto.errorReason).toBe('unknown');
    // Không có payload → dùng nguyên envelope làm payload.
    expect(dto.payload).toMatchObject({ eventId: 'evt-1' });
  });

  it('toFailedEvent dùng first-death-queue dù không khớp x-death', () => {
    const msg = makeMessage(makeEnvelope(), {
      'x-first-death-queue': 'interaction.queue.other',
      'x-death': [
        {
          queue: 'interaction.queue.retry.10s',
          exchange: 'interaction.exchange.retry.10s',
          'routing-keys': ['other.rk'],
        },
      ],
    });

    const dto = consumer['toFailedEvent'](msg);

    expect(dto.queueName).toBe('interaction.queue.other');
    expect(dto.routingKey).toBe('interaction.created');
  });
});
