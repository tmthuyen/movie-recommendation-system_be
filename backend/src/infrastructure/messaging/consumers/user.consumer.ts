import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';

import {
  EventEnvelope,
  EventEnvelopeSchema,
  userCreatedPayloadSchema,
  userDeletedPayloadSchema,
  userUpdatedPayloadSchema,
} from '@/infrastructure/messaging/event.types';
import {
  MESSAGE_EVENTS,
  MESSAGE_BUS_CLIENT,
  MESSAGE_BUS_CONFIG,
} from '@/infrastructure/messaging/messaging.constants';
import { validateWithZodSchema } from '@/common/utils/validate-object.util';

@Injectable()
export class UserHandler {
  private readonly logger = new Logger(UserHandler.name);

  async handleMessage(event: EventEnvelope<unknown>): Promise<void> {
    const correlationId = event.correlationId ?? 'unknown';
    const eventId = event.eventId ?? 'unknown';
    const eventType = event.eventType ?? 'unknown';
    this.logger.log(
      `[UserHandler] correlationId=${correlationId}: Handling eventId=${eventId}, eventType=${eventType}`,
    );

    switch (event.eventType) {
      case MESSAGE_EVENTS.USER_CREATED: {
        const payload = validateWithZodSchema(
          userCreatedPayloadSchema,
          event.payload,
        );
        this.logger.log(
          `[UserHandler] user.created received: userId=${payload.userId}, eventId=${event.eventId}`,
        );
        await Promise.resolve();

        return;
      }
      case MESSAGE_EVENTS.USER_UPDATED_PROFILE: {
        const payload = validateWithZodSchema(
          userUpdatedPayloadSchema,
          event.payload,
        );
        this.logger.log(
          `[UserHandler] user.updated.profile received: userId=${payload.userId}, eventId=${event.eventId}`,
        );
        await Promise.resolve();

        return;
      }
      case MESSAGE_EVENTS.USER_DELETED: {
        const payload = validateWithZodSchema(
          userDeletedPayloadSchema,
          event.payload,
        );
        this.logger.log(
          `[UserHandler] user.deleted received: userId=${payload.userId}, eventId=${event.eventId}`,
        );
        await Promise.resolve();

        return;
      }
      default:
        throw new Error(
          `Unsupported event type on user queue: ${event.eventType}`,
        );
    }
  }
}

@Injectable()
export class UserConsumer implements OnModuleInit {
  private readonly logger = new Logger(UserConsumer.name);

  constructor(
    private readonly handler: UserHandler,
    @Inject(MESSAGE_BUS_CLIENT) private readonly channelWrapper: ChannelWrapper,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('[UserConsumer] Initializing user consumer');
    await this.channelWrapper.addSetup(this.setupConsumer.bind(this));
  }

  async setupConsumer(channel: Channel): Promise<void> {
    await channel.assertExchange(MESSAGE_BUS_CONFIG.USER_EXCHANGE, 'topic', {
      durable: true,
    });
    await channel.assertQueue(MESSAGE_BUS_CONFIG.USER_QUEUE, {
      durable: true,
    });
    await channel.bindQueue(
      MESSAGE_BUS_CONFIG.USER_QUEUE,
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      MESSAGE_BUS_CONFIG.USER_ROUTING_KEY,
    );
    await channel.consume(
      MESSAGE_BUS_CONFIG.USER_QUEUE,
      message => {
        if (message) {
          void this.handleMessage(message, channel);
        }
      },
      { noAck: false },
    );

    this.logger.log(
      `[UserConsumer] Listening on queue=${MESSAGE_BUS_CONFIG.USER_QUEUE}`,
    );
  }

  private async handleMessage(
    message: ConsumeMessage,
    channel: Channel,
  ): Promise<void> {
    let eventId = 'unknown';
    let correlationId = message.properties.correlationId ?? 'unknown';
    let eventType = 'unknown';
    try {
      const event = validateWithZodSchema(
        EventEnvelopeSchema,
        JSON.parse(message.content.toString()),
      );
      eventId = event.eventId;
      correlationId = event.correlationId;
      eventType = event.eventType;
      this.logger.log(
        `[UserConsumer] correlationId=${correlationId}: Received eventId=${eventId}, eventType=${eventType}`,
      );
      await this.handler.handleMessage(event);
      channel.ack(message);
      this.logger.log(
        `[UserConsumer] correlationId=${correlationId}: Successfully processed eventId=${eventId}, eventType=${eventType}`,
      );
    } catch (error) {
      this.logger.error(
        `[UserConsumer] correlationId=${correlationId}: Failed eventId=${eventId}`,
        error instanceof Error ? error.stack : String(error),
      );
      channel.nack(message, false, false);
    }
  }
}
