export const MESSAGE_BUS_CLIENT = 'MESSAGE_BUS_CLIENT';

export const MESSAGE_EVENTS = {
  USER_CREATED: 'user.created',
  USER_EMAIL_VERIFICATION_REQUESTED: 'user.email_verification.requested',
  USER_EMAIL_VERIFIED: 'user.email_verified',
  MOVIE_CREATED: 'movie.created',
  MOVIE_UPDATED: 'movie.updated',
  MOVIE_DELETED: 'movie.deleted',
  USER_INTERACTION_CREATED: 'user.interaction.created',
} as const;

export const MESSAGE_BUS_CONFIG = {
  // movie
  MOVIE_EXCHANGE: 'movie.exchange',
  MOVIE_QUEUE: 'movie.queue',
  MOVIE_ROUTING_KEY: 'movie.#',

  // Recommendation
  RECOMMENDATION_QUEUE: 'recommendation.queue',
  RECOMMENDATION_DLX: 'recommendation.queue.dlx',
  RECOMMENDATION_DLQ: 'recommendation.queue.dlq',
  RECOMMENDATION_DLQ_ROUTING_KEY: 'recommendation.queue.dlq.rk',
  RECOMMENDATION_MAX_RETRY: 3,

  // user
  USER_EXCHANGE: 'user.exchange',
  USER_QUEUE: 'user.queue',
  USER_ROUTING_KEY: 'user.#',
} as const;
