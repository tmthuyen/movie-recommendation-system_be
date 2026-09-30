import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MESSAGE_BUS_CLIENT, MESSAGE_BUS_CONFIG } from '../messaging.constants';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import { FailedEventsService } from '@/modules/failed-events/failed-events.service';
import { FailedEventDto } from '@/modules/failed-events/dtos/failed-event.dto';
import { EventEnvelope } from '../event.types';

@Injectable()
export class RecommendationHandler {
  private readonly logger = new Logger(RecommendationHandler.name);

  constructor(private readonly failedEventsService: FailedEventsService) {}

  // handle recommendation dlq
  async handleRecommendationDlq(eventDto: FailedEventDto): Promise<void> {
    try {
      this.logger.log('Handling failed event', JSON.stringify(eventDto));

      await this.failedEventsService.logFailedEvent(eventDto);

      this.logger.log(`Finished saving failed event`);
    } catch (error) {
      this.logger.error('Error handling failed event', error);
      throw error;
    }
  }
}

@Injectable()
export class RecommendationConsumer implements OnModuleInit {
  private readonly logger = new Logger(RecommendationConsumer.name);

  constructor(
    private readonly handler: RecommendationHandler,
    @Inject(MESSAGE_BUS_CLIENT) private readonly channelWrapper: ChannelWrapper,
  ) {}

  onModuleInit(): void {
    this.logger.log('Initializing Recommendation Consumer...');

    this.channelWrapper.addSetup(this.setupConsumer.bind(this));
  }

  async setupConsumer(channel: Channel): Promise<void> {
    await this.setupTopology(channel);

    // consume recommendation dlq
    await channel.consume(
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ,
      (msg: ConsumeMessage | null) => {
        if (!msg) {
          this.logger.warn('No message received for recommendation dlq');
          return;
        }

        void this.handleMessage(msg, channel);
      },
      {
        noAck: false,
      },
    );

    this.logger.log(
      `RecommendationConsumer listening on ${MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ}`,
    );
  }

  async setupTopology(channel: Channel): Promise<void> {
    // exchange
    await channel.assertExchange(
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLX,
      'topic',
      {
        durable: true,
      },
    );

    // recommendation dlq
    await channel.assertQueue(MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ, {
      durable: true,
    });

    // bind dlq
    await channel.bindQueue(
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ,
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLX,
      MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ_ROUTING_KEY,
    );
  }

  private async handleMessage(
    msg: ConsumeMessage,
    channel: Channel,
  ): Promise<void> {
    try {
      const eventDto = this.toFailedEvent(msg);

      this.logger.log(
        `Recommendation DLQ received message: [Routing Key]: ${eventDto.routingKey} | [Event]: ${JSON.stringify(eventDto.payload)}`,
      );

      await this.handler.handleRecommendationDlq(eventDto);

      // ack message
      channel.ack(msg);
    } catch (error) {
      this.logger.error(
        'Failed to handle recommendation DLQ message',
        error instanceof Error ? error.stack : String(error),
      );

      // nack message
      channel.nack(msg, false, false);
    }
  }

  private toFailedEvent(msg: ConsumeMessage): FailedEventDto {
    const data = JSON.parse(msg.content.toString()) as EventEnvelope<any>;

    const originalMsg = JSON.stringify(msg);
    this.logger.log(`Original DLQ header msg: ${originalMsg}`);

    /**
     * "properties": {
    "headers": {
      "traceparent": "00-cae0538c0d2f742671e84b6c9800b9c9-28e2fea9164c5da8-01",
      "x-death": [
        {
          "count": 1,
          "reason": "rejected",
          "queue": "recommendation.queue.retry.10s",
          "time": {
            "!": "timestamp",
            "value": 1790761240
          },
          "exchange": "movie.exchange.retry.10s",
          "routing-keys": [
            "recommendation.queue.retry.10s.rk"
          ]
        },
        {
          "count": 1,
          "reason": "rejected",
          "queue": "recommendation.queue",
          "time": {
            "!": "timestamp",
            "value": 1790761240
          },
          "exchange": "movie.exchange",
          "routing-keys": [
            "movie.created"
          ]
        }
      ],
      "x-first-death-exchange": "movie.exchange",
      "x-first-death-queue": "recommendation.queue",
      "x-first-death-reason": "rejected",
      "x-last-death-exchange": "movie.exchange.retry.10s",
      "x-last-death-queue": "recommendation.queue.retry.10s",
      "x-last-death-reason": "rejected"
    },
    "deliveryMode": 2
  },
     */
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
      // exchange: originalExchange,
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
