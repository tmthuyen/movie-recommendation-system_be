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

  async publishMovieCreated(
    payload: MovieCreatedPayload,
    correlationId?: string,
  ) {
    // this.logger.debug(
    //   `Publishing movie.created event with payload: ${JSON.stringify(
    //     payload,
    //   )} with [Trace ID] : ${correlationId}`,
    // );
    this.logger.debug(
      `[trace_id=${correlationId}] Publishing movie.created event with movie id: ${payload.movieId}`,
    );

    await this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE,
      MESSAGE_EVENTS.MOVIE_CREATED,
      payload,
      correlationId,
    );
  }

  async publishMovieUpdated(
    payload: MovieUpdatedPayload,
    correlationId?: string,
  ) {
    await this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE,
      MESSAGE_EVENTS.MOVIE_UPDATED,
      payload,
      correlationId,
    );
  }

  async publishMovieDeleted(
    payload: MovieDeletedPayload,
    correlationId?: string,
  ) {
    await this.eventPublisher.publish(
      MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE,
      MESSAGE_EVENTS.MOVIE_DELETED,
      payload,
      correlationId,
    );
  }
}
