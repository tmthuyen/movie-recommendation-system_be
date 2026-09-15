export const MESSAGE_BUS_CLIENT = 'MESSAGE_BUS_CLIENT';

export const MESSAGE_EVENTS = {
  USER_CREATED: 'user.created',
  USER_EMAIL_VERIFICATION_REQUESTED: 'user.email_verification.requested',
  USER_EMAIL_VERIFIED: 'user.email_verified',
  MOVIE_CREATED: 'movie.created',
  MOVIE_UPDATED: 'movie.updated',
  USER_INTERACTION_CREATED: 'user.interaction.created',
} as const;

export const MESSAGE_BUS_CONFIG = {
  exchange: 'movie.events',
  queue: 'backend.events',
  routingKey: 'backend.events',
} as const;
