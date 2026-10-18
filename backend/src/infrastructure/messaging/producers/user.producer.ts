import { Injectable } from '@nestjs/common';
import { EventPublisherService } from '@/infrastructure/messaging/event-publisher.service';
import {
  MESSAGE_BUS_CONFIG,
  MESSAGE_EVENTS,
} from '@/infrastructure/messaging/messaging.constants';
import {
  EmailVerificationRequestedPayload,
  UserCreatedPayload,
  UserUpdatedPayload,
} from '@/infrastructure/messaging/event.types';

@Injectable()
export class UserProducer {
  constructor(private readonly eventPublisher: EventPublisherService) {}

  publishUserCreated(payload: UserCreatedPayload, correlationId?: string) {
    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      MESSAGE_EVENTS.USER_CREATED,
      payload,
      correlationId,
    );
  }

  publishUserUpdated(payload: UserUpdatedPayload, correlationId?: string) {
    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      'user.updated',
      payload,
      correlationId,
    );
  }

  publishUserDeleted(userId: string, correlationId?: string) {
    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      'user.deleted',
      { userId },
      correlationId,
    );
  }

  publishEmailVerificationRequested(
    payload: EmailVerificationRequestedPayload,
    correlationId?: string,
  ) {
    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      MESSAGE_EVENTS.USER_EMAIL_VERIFICATION_REQUESTED,
      payload,
      correlationId,
    );
  }

  publishEmailVerified(userId: string, correlationId?: string) {
    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      MESSAGE_EVENTS.USER_EMAIL_VERIFIED,
      { userId },
      correlationId,
    );
  }
}
