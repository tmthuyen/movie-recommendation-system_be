import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ChannelWrapper } from 'amqp-connection-manager';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MESSAGE_BUS_CLIENT, MESSAGE_BUS_CONFIG } from './messaging.constants';
import { EventEnvelope } from './event.types';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(
    @Inject(MESSAGE_BUS_CLIENT) private readonly channelWrapper: ChannelWrapper,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Publish an event to a RabbitMQ exchange
   * @param exchange The exchange to publish to
   * @param eventType The type of the event, equal to the routing key
   * @param payload The payload of the event
   * @param correlationId The correlation ID of the event, trace id in distributed systems
   */
  publish<TPayload>(
    exchange: string,
    eventType: string,
    payload: TPayload,
    correlationId?: string,
  ): void {
    const event: EventEnvelope<TPayload> = {
      eventId: randomUUID(),
      eventType,
      eventVersion: 1,
      source: this.configService.get<string>('SERVICE_NAME', 'backend-service'),
      occurredAt: new Date().toISOString(),
      correlationId,
      payload,
    };

    // Sử dụng publish tới Exchange được chỉ định
    this.channelWrapper
      .publish(exchange, eventType, event, {
        persistent: true,
      })
      .catch(error => {
        this.logger.error(`Failed to publish ${eventType}: ${error.message}`);
      });
  }
}
