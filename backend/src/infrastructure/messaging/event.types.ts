export interface EventEnvelope<TPayload> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  source: string;
  occurredAt: string;
  correlationId?: string;
  payload: TPayload;
}

export interface MovieCreatedPayload {
  movieId: number;
  title: string;
  titleVi: string;
  overview: string;
  overviewVi: string;
  genres: string[];
}

export interface MovieUpdatedPayload {
  movieId: number;
  title: string;
  titleVi: string;
  overview: string;
  overviewVi: string;
  genres: string[];
}

export interface MovieDeletedPayload {
  movieId: number;
}

export interface UserCreatedPayload {
  userId: string;
  email: string;
  fullName: string;
  status: string;
}

export interface EmailVerificationRequestedPayload {
  userId: string;
  email: string;
  verificationToken: string;
}

export interface UserEmailVerifiedPayload {
  userId: string;
  email?: string;
}
