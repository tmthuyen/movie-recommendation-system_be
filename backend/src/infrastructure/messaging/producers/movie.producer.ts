import { Injectable, Logger } from '@nestjs/common';
import { EventPublisherService } from '../event-publisher.service';
import { MESSAGE_BUS_CONFIG, MESSAGE_EVENTS } from '../messaging.constants';
import {
  MovieCreatedPayload,
  MovieDeletedPayload,
  MovieUpdatedPayload,
} from '../event.types';

@Injectable()
export class MovieProducer {
  private readonly logger = new Logger(MovieProducer.name);

  constructor(private readonly eventPublisher: EventPublisherService) {}

  publishMovieCreated(payload: MovieCreatedPayload, correlationId?: string) {
    this.logger.debug(
      `Publishing movie.created event with payload: ${JSON.stringify(
        payload,
      )} with [Trace ID] : ${correlationId}`,
    );

    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE,
      MESSAGE_EVENTS.MOVIE_CREATED,
      payload,
      correlationId,
    );
  }

  publishMovieUpdated(payload: MovieUpdatedPayload, correlationId?: string) {
    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE,
      MESSAGE_EVENTS.MOVIE_UPDATED,
      payload,
      correlationId,
    );
  }

  publishMovieDeleted(payload: MovieDeletedPayload, correlationId?: string) {
    this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE,
      MESSAGE_EVENTS.MOVIE_DELETED,
      payload,
      correlationId,
    );
  }
}
