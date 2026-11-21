import z from 'zod';

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  eventVersion: number;
  source: string;
  occurredAt: string;
  correlationId?: string;
  /** Chủ sở hữu của event; nằm ở envelope để payload giữ thuần domain data. */
  userId?: string;
  payload: T;
}

export const EventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.string().min(1),
  eventVersion: z.number().int().positive(),
  source: z.string().min(1),
  occurredAt: z.string().datetime(),
  correlationId: z.string().optional(),
  userId: z.string().optional(),
  payload: z.unknown(),
});

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

export const userCreatedPayloadSchema = z.object({
  userId: z.string(),
  email: z.email(),
  fullName: z.string(),
  status: z.string(),
  preferenceData: z.record(z.string(), z.array(z.string())),
});

export type UserCreatedPayloadType = z.infer<typeof userCreatedPayloadSchema>;

export const userUpdatedPayloadSchema = z.object({
  userId: z.string(),
  preferenceData: z.record(z.string(), z.array(z.string())),
});

export type UserUpdatedPayloadType = z.infer<typeof userUpdatedPayloadSchema>;

export const userDeletedPayloadSchema = z.object({
  userId: z.string(),
});

export type UserDeletedPayloadType = z.infer<typeof userDeletedPayloadSchema>;

/** Payload event `user.search` — userId nằm trong payload cùng keyword. */
export const userSearchPayloadSchema = z.object({
  userId: z.string(),
  mode: z.enum(['semantic', 'hybrid', 'db']),
  keywordRaw: z.string(),
  keywordNormalized: z.string(),
});

export type UserSearchPayloadType = z.infer<typeof userSearchPayloadSchema>;

/**
 * Payload event `user.genre.update` — genre lấy từ payload tương tác.
 * `score` là score gốc theo band tương tác; ai-service tự chuẩn hoá theo `type`.
 */
export const userGenreUpdatePayloadSchema = z.object({
  type: z.enum(['click', 'like', 'rating', 'comment']),
  genres: z.array(
    z.object({
      id: z.number().int().positive(),
      name: z.string(),
    }),
  ),
  score: z.number(),
});

export type UserGenreUpdatePayloadType = z.infer<
  typeof userGenreUpdatePayloadSchema
>;

export const emailVerificationRequestedPayloadSchema = z.object({
  userId: z.string(),
  email: z.email(),
  verificationToken: z.string(),
});

export type EmailVerificationRequestedPayloadType = z.infer<
  typeof emailVerificationRequestedPayloadSchema
>;

export const userEmailVerifiedPayloadSchema = z.object({
  userId: z.string(),
  email: z.email(),
});

export type UserEmailVerifiedPayloadType = z.infer<
  typeof userEmailVerifiedPayloadSchema
>;

// export interface UserCreatedPayload {
//   userId: string;
//   email: string;
//   fullName: string;
//   status: string;
//   preferenceData: Record<string, string[]>;
// }

// export interface UserUpdatedPayload {
//   userId: string;
//   preferenceData: Record<string, string[]>;
// }

// export interface UserDeletedPayload {
//   userId: string;
// }

// export interface EmailVerificationRequestedPayload {
//   userId: string;
//   email: string;
//   verificationToken: string;
// }

// export interface UserEmailVerifiedPayload {
//   userId: string;
//   email: string;
// }

// Interactions
export interface InteractionCreatedPayload {
  userId: string;
  movieId: number;
  action: string;
  score: number | null;
  removed: boolean;
  createdAt: Date;
}

// Training payload
export interface TrainingRequestedPayload {
  folder: string;
}
