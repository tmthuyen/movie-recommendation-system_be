import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ChannelWrapper } from 'amqp-connection-manager';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MESSAGE_BUS_CLIENT } from './messaging.constants';
import { EventEnvelope } from './event.types';
import { context, propagation, trace } from '@opentelemetry/api';

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
   * @param routingKey Optional routing key when it differs from the event type
   */
  publish<TPayload>(
    exchange: string,
    eventType: string,
    payload: TPayload,
    correlationId?: string,
    routingKey?: string,
  ): void {
    this.logger.log(
      `Sự kiện: type=${eventType}, exchange=${exchange}, routingKey=${routingKey ?? eventType} | correlationId=${correlationId}`,
    );

    // lấy traceId của open telemetry làm correlationId
    const activeSpan = trace.getActiveSpan();
    const traceId = activeSpan?.spanContext().traceId;
    const headers: Record<string, string> = {};
    propagation.inject(context.active(), headers);

    const event: EventEnvelope<TPayload> = {
      eventId: randomUUID(),
      eventType,
      eventVersion: 1,
      source: this.configService.get<string>('SERVICE_NAME', 'backend-service'),
      occurredAt: new Date().toISOString(),
      correlationId: correlationId ?? traceId,
      payload,
    };

    // Sử dụng publish tới Exchange được chỉ định
    this.channelWrapper
      .publish(exchange, routingKey ?? eventType, event, {
        persistent: true,
        headers,
      })
      .catch((error: Error) => {
        this.logger.error(`Failed to publish ${eventType}: ${error.message}`);
      });

    // log
    this.logger.log(
      `Đã publish sự kiện [Type=${eventType}] | [TraceID=${traceId}] | [CorrelationID=${correlationId}] | [EventID=${event.eventId}]]`,
    );
  }
}
