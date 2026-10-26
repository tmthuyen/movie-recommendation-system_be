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

export type UserUpdatedPayload = UserCreatedPayload;

export interface UserDeletedPayload {
  userId: string;
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

// Interactions
export interface InteractionCreatedPayload {
  userId: string;
  movieId: number;
  action: string;
  score: number;
  /** `true` khi huỷ tương tác (unlike) — score mang giá trị âm. */
  removed: boolean;
  createdAt: Date;
}
