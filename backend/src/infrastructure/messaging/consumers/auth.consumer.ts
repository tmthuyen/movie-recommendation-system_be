import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { Channel, ConsumeMessage } from 'amqplib';
import { IMailService } from '@/infrastructure/mail/mail.service';
import {
  createEmailVerifiedTemplate,
  createVerificationEmailTemplate,
} from '@/infrastructure/mail/mail.templates';
import {
  MESSAGE_BUS_CLIENT,
  MESSAGE_BUS_CONFIG,
  MESSAGE_EVENTS,
} from '@/infrastructure/messaging/messaging.constants';
import {
  emailVerificationRequestedPayloadSchema,
  EventEnvelopeSchema,
  userEmailVerifiedPayloadSchema,
  type EventEnvelope,
} from '@/infrastructure/messaging/event.types';
import { validateWithZodSchema } from '@/common/utils/validate-object.util';

@Injectable()
export class AuthHandler {
  private readonly logger = new Logger(AuthHandler.name);

  constructor(
    @Inject(IMailService) private readonly mailService: IMailService,
  ) {}

  async handleMessage(event: EventEnvelope<unknown>): Promise<void> {
    const correlationId = event.correlationId ?? 'unknown';
    const eventId = event.eventId ?? 'unknown';
    const eventType = event.eventType ?? 'unknown';
    this.logger.log(
      `[AuthHandler] correlationId=${correlationId}: Handling eventId=${eventId}, eventType=${eventType}`,
    );

    switch (event.eventType) {
      case MESSAGE_EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED: {
        const payload = validateWithZodSchema(
          emailVerificationRequestedPayloadSchema,
          event.payload,
        );
        await this.mailService.sendMail({
          to: payload.email,
          ...createVerificationEmailTemplate(payload.verificationToken),
        });
        this.logger.log(
          `[AuthHandler] Verification email sent: userId=${payload.userId}, eventId=${event.eventId}`,
        );
        return;
      }
      case MESSAGE_EVENTS.AUTH_EMAIL_VERIFIED: {
        const payload = validateWithZodSchema(
          userEmailVerifiedPayloadSchema,
          event.payload,
        );
        await this.mailService.sendMail({
          to: payload.email,
          ...createEmailVerifiedTemplate(),
        });
        this.logger.log(
          `[AuthHandler] Email verified notification sent: userId=${payload.userId}, eventId=${event.eventId}`,
        );
        return;
      }
      default:
        throw new Error(
          `Unsupported event type on auth queue: ${event.eventType}`,
        );
    }
  }
}

@Injectable()
export class AuthConsumer implements OnModuleInit {
  private readonly logger = new Logger(AuthConsumer.name);

  constructor(
    private readonly handler: AuthHandler,
    @Inject(MESSAGE_BUS_CLIENT) private readonly channelWrapper: ChannelWrapper,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('[AuthConsumer] Initializing auth consumer');
    await this.channelWrapper.addSetup(this.setupConsumer.bind(this));
  }

  async setupConsumer(channel: Channel): Promise<void> {
    await channel.assertExchange(MESSAGE_BUS_CONFIG.AUTH_EXCHANGE, 'topic', {
      durable: true,
    });
    await channel.assertQueue(MESSAGE_BUS_CONFIG.AUTH_QUEUE, {
      durable: true,
    });
    await channel.bindQueue(
      MESSAGE_BUS_CONFIG.AUTH_QUEUE,
      MESSAGE_BUS_CONFIG.AUTH_EXCHANGE,
      MESSAGE_BUS_CONFIG.AUTH_ROUTING_KEY,
    );
    await channel.consume(
      MESSAGE_BUS_CONFIG.AUTH_QUEUE,
      message => {
        if (message) {
          void this.handleMessage(message, channel);
        }
      },
      { noAck: false },
    );

    this.logger.log(
      `[AuthConsumer] Listening on queue=${MESSAGE_BUS_CONFIG.AUTH_QUEUE}`,
    );
  }

  private async handleMessage(
    message: ConsumeMessage,
    channel: Channel,
  ): Promise<void> {
    let eventId = 'unknown';
    let correlationId;
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
        `[AuthConsumer] correlationId=${correlationId}: Received eventId=${eventId}, eventType=${eventType}`,
      );
      await this.handler.handleMessage(event);
      channel.ack(message);
      this.logger.log(
        `[AuthConsumer] correlationId=${correlationId}: Successfully processed eventId=${eventId}, eventType=${eventType}`,
      );
    } catch (error) {
      this.logger.error(
        `[AuthConsumer] correlationId=${correlationId}: Failed eventId=${eventId}`,
        error instanceof Error ? error.stack : String(error),
      );
      channel.nack(message, false, false);
    }
  }
}
