import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { MESSAGE_BUS_CLIENT } from './messaging.constants';
import { EventEnvelope } from './messaging.types';

@Injectable()
export class EventPublisherService {
  private readonly logger = new Logger(EventPublisherService.name);

  constructor(
    @Inject(MESSAGE_BUS_CLIENT) private readonly client: ClientProxy,
    private readonly configService: ConfigService,
  ) {}

  publish<TPayload>(
    eventType: string,
    payload: TPayload,
    correlationId?: string,
  ): void {
    if (this.configService.get<string>('RABBITMQ_ENABLED') !== 'true') {
      this.logger.debug(`RabbitMQ disabled; skipped ${eventType}`);
      return;
    }

    const event: EventEnvelope<TPayload> = {
      eventId: randomUUID(),
      eventType,
      eventVersion: 1,
      source: this.configService.get<string>('SERVICE_NAME', 'backend-service'),
      occurredAt: new Date().toISOString(),
      correlationId,
      payload,
    };

    this.client.emit(eventType, event).subscribe({
      error: error => {
        // Publishing is deliberately non-blocking; the request must not fail because the broker is unavailable.
        this.logger.error(`Failed to publish ${eventType}: ${error.message}`);
      },
    });
  }
}
