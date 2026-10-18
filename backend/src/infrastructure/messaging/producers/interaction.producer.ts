import { Injectable, Logger } from '@nestjs/common';
import { EventPublisherService } from '@/infrastructure/messaging/event-publisher.service';
import { MESSAGE_BUS_CONFIG } from '@/infrastructure/messaging/messaging.constants';
import { InteractionCreatedPayload } from '@/infrastructure/messaging/event.types';

@Injectable()
export class InteractionProducer {
  private readonly logger = new Logger(InteractionProducer.name);

  constructor(private readonly eventPublisher: EventPublisherService) {}

  /**
   * Publish a real-time interaction event for EMA update
   */
  publishInteractionCreated(
    payload: InteractionCreatedPayload,
    correlationId?: string,
  ): void {
    this.logger.log(
      `Publishing interaction event for User: ${payload.userId} -> Movie: ${payload.movieId}`,
    );
    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.INTERACTION_EXCHANGE,
      MESSAGE_BUS_CONFIG.INTERACTION_EVENT_RK,
      payload,
      correlationId,
    );
  }

  /**
   * Publish a batch of interactions for background training
   */
  publishTrainingBatch(
    interactions: InteractionCreatedPayload[],
    correlationId?: string,
  ): void {
    this.logger.log(
      `Publishing training batch with ${interactions.length} records`,
    );
    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.INTERACTION_EXCHANGE,
      MESSAGE_BUS_CONFIG.INTERACTION_TRAINING_BATCH_RK,
      { interactions },
      correlationId,
    );
  }
}
