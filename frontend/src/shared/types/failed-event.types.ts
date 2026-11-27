/** Trạng thái xử lý của một sự kiện rớt DLQ. */
export type FailedEventStatus = 'PENDING' | 'RETRIED_SUCCESS' | 'RETRIED_FAILED';

/** Một bản ghi `GET /api/failed-events` (entity `failed_events`). */
export interface FailedEvent {
  id: string;
  source?: string;
  queueName: string;
  routingKey: string;
  eventId?: string;
  eventType?: string;
  correlationId?: string;
  payload: Record<string, unknown>;
  errorReason?: string;
  status: FailedEventStatus;
  retryCount: number;
  occurredAt?: string;
  createdAt?: string;
  updatedAt?: string;
}
