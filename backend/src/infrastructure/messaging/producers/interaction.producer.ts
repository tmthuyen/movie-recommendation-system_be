import { Injectable, Logger } from '@nestjs/common';
import { EventPublisherService } from '@/infrastructure/messaging/event-publisher.service';
import {
  MESSAGE_BUS_CONFIG,
  MESSAGE_EVENTS,
} from '@/infrastructure/messaging/messaging.constants';
import {
  InteractionCreatedPayload,
  TrainingRequestedPayload,
} from '@/infrastructure/messaging/event.types';

@Injectable()
export class InteractionProducer {
  private readonly logger = new Logger(InteractionProducer.name);

  constructor(private readonly eventPublisher: EventPublisherService) {}

  /**
   * Publish a real-time interaction event for EMA update.
   * `eventType=interaction.created`; routing key giữ `interaction.event`.
   */
  async publishInteractionCreated(
    payload: InteractionCreatedPayload,
    correlationId?: string,
  ): Promise<void> {
    this.logger.log(
      `[InteractionProducer] Publishing interaction event for User: ${payload.userId} -> Movie: ${payload.movieId} (type=${payload.action}, score=${payload.score})`,
    );
    await this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.INTERACTION_EXCHANGE,
      MESSAGE_EVENTS.INTERACTION_CREATED,
      payload,
      correlationId,
      MESSAGE_BUS_CONFIG.INTERACTION_EVENT_RK,
    );
  }

  /**
   * Publish a batch of interactions for background training
   * @deprecated Use `publishTrainingRequest` instead to trigger training with a folder of interactions
   */
  async publishTrainingBatch(
    interactions: InteractionCreatedPayload[],
    correlationId?: string,
  ): Promise<void> {
    this.logger.log(
      `Publishing training batch with ${interactions.length} records`,
    );

    await this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.INTERACTION_EXCHANGE,
      MESSAGE_BUS_CONFIG.INTERACTION_TRAINING_BATCH_RK,
      { interactions },
      correlationId,
      MESSAGE_BUS_CONFIG.INTERACTION_TRAINING_BATCH_RK,
    );
  }
  /**
   * Publish a training request for background training
   */
  async publishTrainingRequest(
    payload: TrainingRequestedPayload,
    correlationId?: string,
  ): Promise<void> {
    this.logger.log(
      `correlationId=${correlationId} - Publishing training request with folder: ${payload.folder}`,
    );

    await this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.INTERACTION_EXCHANGE,
      MESSAGE_BUS_CONFIG.INTERACTION_TRAINING_REQUEST_RK,
      payload,
      correlationId,
      MESSAGE_BUS_CONFIG.INTERACTION_TRAINING_REQUEST_RK,
    );
  }
}
