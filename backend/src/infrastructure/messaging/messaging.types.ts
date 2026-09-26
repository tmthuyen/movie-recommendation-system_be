export interface EventEnvelope<TPayload> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  source: string;
  occurredAt: string;
  correlationId?: string;
  payload: TPayload;
}

export interface UserCreatedPayload {
  userId: number;
  email: string;
  fullName: string;
  status: string;
}

export interface EmailVerificationRequestedPayload {
  userId: number;
  email: string;
  verificationToken: string;
}

export interface UserEmailVerifiedPayload {
  userId: number;
  email?: string;
}
