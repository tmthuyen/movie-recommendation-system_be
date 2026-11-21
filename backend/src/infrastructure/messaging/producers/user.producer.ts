import { Injectable } from '@nestjs/common';
import { EventPublisherService } from '@/infrastructure/messaging/event-publisher.service';
import {
  MESSAGE_BUS_CONFIG,
  MESSAGE_EVENTS,
} from '@/infrastructure/messaging/messaging.constants';
import {
  EmailVerificationRequestedPayloadType,
  UserCreatedPayloadType,
  UserEmailVerifiedPayloadType,
  UserGenreUpdatePayloadType,
  UserSearchPayloadType,
  UserUpdatedPayloadType,
} from '@/infrastructure/messaging/event.types';

@Injectable()
export class UserProducer {
  constructor(private readonly eventPublisher: EventPublisherService) {}

  // ========================
  // user queue
  publishUserCreated(
    payload: UserCreatedPayloadType,
    correlationId?: string,
  ): Promise<void> {
    return this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      MESSAGE_EVENTS.USER_CREATED,
      payload,
      correlationId,
      MESSAGE_EVENTS.USER_CREATED,
    );
  }

  publishUserUpdated(
    payload: UserUpdatedPayloadType,
    correlationId?: string,
  ): Promise<void> {
    return this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      MESSAGE_EVENTS.USER_UPDATED_PROFILE,
      payload,
      correlationId,
      MESSAGE_EVENTS.USER_UPDATED_PROFILE,
    );
  }

  publishUserDeleted(userId: string, correlationId?: string): Promise<void> {
    return this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      MESSAGE_EVENTS.USER_DELETED,
      { userId },
      correlationId,
      MESSAGE_EVENTS.USER_DELETED,
    );
  }

  /**
   * Phát event search của user; userId nằm trong payload, không đưa lên envelope.
   * Payload gồm userId/mode/keywordRaw/keywordNormalized; correlationId và routingKey được giữ nguyên event type.
   * @returns Promise<void>; phát qua exchange user, không ghi DB/Redis.
   */
  publishUserSearch(
    payload: UserSearchPayloadType,
    correlationId?: string,
  ): Promise<void> {
    return this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      MESSAGE_EVENTS.USER_SEARCH,
      payload,
      correlationId,
      MESSAGE_EVENTS.USER_SEARCH,
    );
  }

  /**
   * Phát event cập nhật vector genre của user.
   * Event độc lập, không gộp vào `interaction.created`; userId được đưa lên envelope.
   * @returns Promise<void>; phát qua exchange user, không ghi DB/Redis.
   */
  publishUserGenreUpdate(
    payload: UserGenreUpdatePayloadType,
    correlationId?: string,
    userId?: string,
  ): Promise<void> {
    return this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      MESSAGE_EVENTS.USER_GENRE_UPDATE,
      payload,
      correlationId,
      MESSAGE_EVENTS.USER_GENRE_UPDATE,
      userId,
    );
  }

  // ========================
  // auth queue
  publishEmailVerificationRequested(
    payload: EmailVerificationRequestedPayloadType,
    correlationId?: string,
  ): Promise<void> {
    return this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.AUTH_EXCHANGE,
      MESSAGE_EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED,
      payload,
      correlationId,
      MESSAGE_EVENTS.AUTH_EMAIL_VERIFICATION_REQUESTED,
    );
  }

  publishEmailVerified(
    payload: UserEmailVerifiedPayloadType,
    correlationId?: string,
  ): Promise<void> {
    return this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.AUTH_EXCHANGE,
      MESSAGE_EVENTS.AUTH_EMAIL_VERIFIED,
      payload,
      correlationId,
      MESSAGE_EVENTS.AUTH_EMAIL_VERIFIED,
    );
  }
}
