import { ConfigService } from '@nestjs/config';
import type { ChannelWrapper } from 'amqp-connection-manager';

import { EventPublisherService } from './event-publisher.service';
import { EventEnvelope } from './event.types';

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('EventPublisherService', () => {
  let service: EventPublisherService;
  let channel: { publish: jest.Mock };
  let config: { get: jest.Mock };
  let loggerError: jest.SpyInstance;

  const lastEnvelope = (): EventEnvelope<unknown> =>
    channel.publish.mock.calls[0][2] as EventEnvelope<unknown>;

  beforeEach(() => {
    channel = { publish: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn((key: string, defaultValue?: unknown) =>
        key === 'SERVICE_NAME' ? 'backend-service' : defaultValue,
      ),
    };

    service = new EventPublisherService(
      channel as unknown as ChannelWrapper,
      config as unknown as ConfigService,
    );

    loggerError = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  it('publish đúng exchange / routing key (mặc định = eventType) và persistent', () => {
    service.publish(
      'movie.exchange',
      'movie.created',
      { movieId: 1 },
      'corr-1',
    );

    expect(channel.publish).toHaveBeenCalledTimes(1);
    const [exchange, routingKey, , options] = channel.publish.mock.calls[0] as [
      string,
      string,
      EventEnvelope<unknown>,
      { persistent: boolean },
    ];
    expect(exchange).toBe('movie.exchange');
    expect(routingKey).toBe('movie.created');
    expect(options).toEqual({ persistent: true });
  });

  it('đóng gói EventEnvelope đầy đủ (eventId UUID v4, version 1, source, ISO occurredAt)', () => {
    service.publish(
      'user.exchange',
      'user.created',
      { userId: 'u1' },
      'corr-9',
    );

    const envelope = lastEnvelope();
    expect(envelope).toMatchObject({
      eventType: 'user.created',
      eventVersion: 1,
      source: 'backend-service',
      correlationId: 'corr-9',
      payload: { userId: 'u1' },
    });
    expect(envelope.eventId).toMatch(UUID_V4);
    expect(new Date(envelope.occurredAt).toISOString()).toBe(
      envelope.occurredAt,
    );
    expect(config.get).toHaveBeenCalledWith('SERVICE_NAME', 'backend-service');
  });

  it('routingKey tuỳ biến được ưu tiên hơn eventType', () => {
    service.publish(
      'user.exchange',
      'interaction.created',
      { userId: 'u1', movieId: 2 },
      undefined,
      'user.interaction.created',
    );

    const [, routingKey, envelope] = channel.publish.mock.calls[0] as [
      string,
      string,
      EventEnvelope<unknown>,
    ];
    expect(routingKey).toBe('user.interaction.created');
    expect(envelope.eventType).toBe('interaction.created');
    expect(envelope.correlationId).toBeUndefined();
  });

  it('SERVICE_NAME lấy từ ConfigService khi được cấu hình', () => {
    config.get.mockImplementation((key: string, defaultValue?: unknown) =>
      key === 'SERVICE_NAME' ? 'recommendation-service' : defaultValue,
    );

    service.publish('movie.exchange', 'movie.updated', { movieId: 1 });

    expect(lastEnvelope().source).toBe('recommendation-service');
  });

  it('mỗi lần publish có eventId khác nhau', () => {
    service.publish('movie.exchange', 'movie.created', { movieId: 1 });
    service.publish('movie.exchange', 'movie.created', { movieId: 1 });

    const first = channel.publish.mock.calls[0][2] as EventEnvelope<unknown>;
    const second = channel.publish.mock.calls[1][2] as EventEnvelope<unknown>;
    expect(first.eventId).toMatch(UUID_V4);
    expect(second.eventId).toMatch(UUID_V4);
    expect(first.eventId).not.toBe(second.eventId);
  });

  it('channel từ chối (async) → log error, không ném ra ngoài', async () => {
    channel.publish.mockRejectedValue(new Error('channel closed'));

    expect(() =>
      service.publish('movie.exchange', 'movie.created', { movieId: 1 }),
    ).not.toThrow();

    // Chờ microtask để .catch() của service chạy.
    await new Promise(resolve => setImmediate(resolve));

    expect(loggerError).toHaveBeenCalledWith(
      'Failed to publish movie.created: channel closed',
    );
  });

  it('lỗi đồng bộ từ channel hiện chưa được bọc → ném ra ngoài', () => {
    // Hành vi hiện tại: chỉ promise rejection được .catch(), còn throw đồng bộ
    // từ channelWrapper.publish() sẽ lan ra caller.
    channel.publish.mockImplementation(() => {
      throw new Error('channel is closed');
    });

    expect(() =>
      service.publish('movie.exchange', 'movie.created', { movieId: 1 }),
    ).toThrow('channel is closed');
    expect(loggerError).not.toHaveBeenCalled();
  });
});
