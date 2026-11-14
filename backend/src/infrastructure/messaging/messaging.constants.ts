export const MESSAGE_BUS_CLIENT = 'MESSAGE_BUS_CLIENT';

export const MESSAGE_EVENTS = {
  USER_CREATED: 'user.created',
  USER_UPDATED_PROFILE: 'user.updated.profile',
  USER_DELETED: 'user.deleted',
  AUTH_EMAIL_VERIFICATION_REQUESTED: 'auth.email_verification.requested',
  AUTH_EMAIL_VERIFIED: 'auth.email_verified',
  MOVIE_CREATED: 'movie.created',
  MOVIE_UPDATED: 'movie.updated',
  MOVIE_DELETED: 'movie.deleted',
  INTERACTION_CREATED: 'interaction.created',
  INTERACTION_TRAINING_REQUEST: 'training.request',
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

  // auth: mail xác thực, mail reset password, mail bảo mật
  AUTH_EXCHANGE: 'auth.exchange',
  AUTH_QUEUE: 'auth.queue',
  AUTH_ROUTING_KEY: 'auth.#',

  // interaction
  INTERACTION_EXCHANGE: 'interaction.exchange',
  INTERACTION_QUEUE: 'interaction.queue',
  INTERACTION_EVENT_RK: 'interaction.event',
  INTERACTION_TRAINING_BATCH_RK: 'training.batch',
  INTERACTION_TRAINING_REQUEST_RK: 'training.request',
  INTERACTION_DLX: 'interaction.queue.dlx',
  INTERACTION_DLQ: 'interaction.queue.dlq',
  INTERACTION_DLQ_ROUTING_KEY: 'interaction.queue.dlq.rk',
} as const;
