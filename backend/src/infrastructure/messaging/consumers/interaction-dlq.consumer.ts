import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MESSAGE_BUS_CLIENT, MESSAGE_BUS_CONFIG } from '../messaging.constants';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import { FailedEventsService } from '@/modules/failed-events/failed-events.service';
import { FailedEventDto } from '@/modules/failed-events/dtos/failed-event.dto';
import { EventEnvelope } from '../event.types';

@Injectable()
export class InteractionHandler {
  private readonly logger = new Logger(InteractionHandler.name);

  constructor(private readonly failedEventsService: FailedEventsService) {}

  // handle interaction dlq
  async handleInteractionDlq(eventDto: FailedEventDto): Promise<void> {
    try {
      this.logger.log(
        'Handling failed interaction event',
        JSON.stringify(eventDto),
      );

      await this.failedEventsService.logFailedEvent(eventDto);

      this.logger.log(`Finished saving failed interaction event`);
    } catch (error) {
      this.logger.error('Error handling failed interaction event', error);
      throw error;
    }
  }
}

@Injectable()
export class InteractionConsumer implements OnModuleInit {
  private readonly logger = new Logger(InteractionConsumer.name);

  constructor(
    private readonly handler: InteractionHandler,
    @Inject(MESSAGE_BUS_CLIENT) private readonly channelWrapper: ChannelWrapper,
  ) {}

  onModuleInit(): void {
    this.logger.log('Initializing Interaction Consumer...');

    this.channelWrapper.addSetup(this.setupConsumer.bind(this));
  }

  async setupConsumer(channel: Channel): Promise<void> {
    await this.setupTopology(channel);

    // consume interaction dlq
    await channel.consume(
      MESSAGE_BUS_CONFIG.INTERACTION_DLQ,
      (msg: ConsumeMessage | null) => {
        if (!msg) {
          this.logger.warn('No message received for interaction dlq');
          return;
        }

        void this.handleMessage(msg, channel);
      },
      {
        noAck: false,
      },
    );

    this.logger.log(
      `InteractionConsumer listening on ${MESSAGE_BUS_CONFIG.INTERACTION_DLQ}`,
    );
  }

  async setupTopology(channel: Channel): Promise<void> {
    // exchange
    await channel.assertExchange(MESSAGE_BUS_CONFIG.INTERACTION_DLX, 'topic', {
      durable: true,
    });

    // interaction dlq
    await channel.assertQueue(MESSAGE_BUS_CONFIG.INTERACTION_DLQ, {
      durable: true,
    });

    // bind dlq
    await channel.bindQueue(
      MESSAGE_BUS_CONFIG.INTERACTION_DLQ,
      MESSAGE_BUS_CONFIG.INTERACTION_DLX,
      MESSAGE_BUS_CONFIG.INTERACTION_DLQ_ROUTING_KEY,
    );
  }

  private async handleMessage(
    msg: ConsumeMessage,
    channel: Channel,
  ): Promise<void> {
    try {
      const eventDto = this.toFailedEvent(msg);

      this.logger.log(
        `Interaction DLQ received message: [Routing Key]: ${eventDto.routingKey} | [Event]: ${JSON.stringify(eventDto.payload)}`,
      );

      await this.handler.handleInteractionDlq(eventDto);

      // ack message
      channel.ack(msg);
    } catch (error) {
      this.logger.error(
        'Failed to handle interaction DLQ message',
        error instanceof Error ? error.stack : String(error),
      );

      // nack message
      channel.nack(msg, false, false);
    }
  }

  private toFailedEvent(msg: ConsumeMessage): FailedEventDto {
    const data = JSON.parse(msg.content.toString()) as EventEnvelope<any>;

    const headers = msg.properties.headers ?? {};

    const xDeath = Array.isArray(headers['x-death']) ? headers['x-death'] : [];

    const firstDeathQueue = headers['x-first-death-queue'];
    const firstDeathExchange = headers['x-first-death-exchange'];

    const originalDeath = xDeath.find(
      (death: any) =>
        death.queue === firstDeathQueue &&
        death.exchange === firstDeathExchange,
    );

    const originalRoutingKey =
      originalDeath?.['routing-keys']?.[0] ?? data.eventType;

    const originalQueue = firstDeathQueue ?? originalDeath?.queue ?? 'unknown';

    const originalExchange =
      firstDeathExchange ?? originalDeath?.exchange ?? 'unknown';

    const originalReason =
      headers['x-first-death-reason'] ?? originalDeath?.reason ?? 'unknown';

    return {
      source: data.source,
      routingKey: originalRoutingKey,
      queueName: originalQueue,
      retryCount: 0,
      eventId: data.eventId,
      eventType: data.eventType,
      payload: data.payload ?? data,
      errorReason: originalReason,
      occurredAt: data.occurredAt,
    };
  }
}
