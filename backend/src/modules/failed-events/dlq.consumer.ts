import { Injectable, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { FailedEventsService } from './failed-events.service';

@Injectable()
export class DlqConsumer {
  private readonly logger = new Logger(DlqConsumer.name);

  constructor(private readonly failedEventsService: FailedEventsService) {}

  // Đón message từ DLQ (queue: failed_events_queue)
  @EventPattern('dlq_routing_key')
  async handleDeadLetterMessage(
    @Payload() data: any,
    @Ctx() context: RmqContext,
  ) {
    const originalMsg = context.getMessage();
    const channel = context.getChannelRef();

    try {
      this.logger.error(`Received dead letter message`);

      const deathHeaders = originalMsg.properties.headers?.['x-death'];
      const routingKey = deathHeaders
        ? deathHeaders[0]?.['routing-keys']?.[0]
        : originalMsg.fields.routingKey;
      const queueName = deathHeaders ? deathHeaders[0]?.queue : 'unknown';
      const errorReason = deathHeaders ? deathHeaders[0]?.reason : 'rejected';

      await this.failedEventsService.logFailedEvent(
        data,
        routingKey,
        queueName,
        errorReason,
      );

      // Đã xử lý (lưu db thành công) -> ACK để xoá khỏi DLQ
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error('Error handling DLQ message', error);
      // NACK để message giữ lại trong DLQ nếu quá trình lưu Database bị lỗi
      channel.nack(originalMsg, false, false);
    }
  }
}
