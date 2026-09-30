export class FailedEventDto {
  source: string;
  eventId: string;
  eventType: string;
  routingKey: string;
  queueName: string;
  correlationId?: string;
  payload: Record<string, any>;
  errorReason: string;
  retryCount: number;
  occurredAt: string;
}
