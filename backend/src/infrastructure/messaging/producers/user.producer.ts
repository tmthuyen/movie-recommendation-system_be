import { Injectable } from '@nestjs/common';
import { EventPublisherService } from '../event-publisher.service';
import { MESSAGE_BUS_CONFIG, MESSAGE_EVENTS } from '../messaging.constants';

@Injectable()
export class UserProducer {
  constructor(private readonly eventPublisher: EventPublisherService) {}

  publishUserCreated(payload: any, correlationId?: string) {
    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.USER_EXCHANGE,
      MESSAGE_EVENTS.USER_CREATED,
      payload,
      correlationId,
    );
  }

  publishUserUpdated(payload: any, correlationId?: string) {
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

  publishEmailVerificationRequested(payload: any, correlationId?: string) {
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
