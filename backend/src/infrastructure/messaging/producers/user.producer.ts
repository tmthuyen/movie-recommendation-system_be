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
