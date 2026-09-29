import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { MESSAGE_BUS_CLIENT, MESSAGE_BUS_CONFIG } from '../messaging.constants';
import type { ChannelWrapper } from 'amqp-connection-manager';
import type { ConsumeMessage } from 'amqplib';
import { FailedEventsService } from '@/modules/failed-events/failed-events.service';

@Injectable()
export class RecommendationHandler {
  private readonly logger = new Logger(RecommendationHandler.name);

  constructor(private readonly failedEventsService: FailedEventsService) {}

  // handle recommendation dlq
  async handleRecommendationDlq(originalMsg: ConsumeMessage, channel: any) {
    try {
      const routingKey = originalMsg.fields.routingKey;
      const dataStr = originalMsg.content.toString();
      const data = JSON.parse(dataStr);

      const deathHeaders = originalMsg.properties.headers?.['x-death'];
      const actualRoutingKey = deathHeaders
        ? deathHeaders[0]?.['routing-keys']?.[0]
        : originalMsg.fields.routingKey;
      const queueName = deathHeaders ? deathHeaders[0]?.queue : 'unknown';
      const errorReason = deathHeaders ? deathHeaders[0]?.reason : 'rejected';

      await this.failedEventsService.logFailedEvent(
        data,
        actualRoutingKey,
        queueName,
        errorReason,
      );

      this.logger.warn(
        `Đã lưu event failed vào db cho routing key: ${actualRoutingKey}`,
      );

      // Xử lý xong thì báo ACK
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error('Lỗi khi xử lý sự kiện trong Consumer', error);
      // Lỗi thì NACK, không requeue (vứt vào DLQ của backend nếu có)
      channel.nack(originalMsg, false, false);
    }
  }
}

@Injectable()
export class RecommendationConsumer implements OnModuleInit {
  private readonly logger = new Logger(RecommendationConsumer.name);

  constructor(
    private readonly handler: RecommendationHandler,
    @Inject(MESSAGE_BUS_CLIENT) private readonly channelWrapper: ChannelWrapper,
  ) {}

  onModuleInit() {
    this.logger.log('Initializing Recommendation Consumer...');

    // Đăng ký nhận sự kiện (Backend tự nghe lại các sự kiện của chính mình nếu cần)

    this.channelWrapper.addSetup(async (channel: any) => {
      // recommendation dlq
      await channel.assertQueue(MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ, {
        durable: true,
      });

      // bind dlq
      await channel.bindQueue(
        MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ,
        MESSAGE_BUS_CONFIG.RECOMMENDATION_DLX,
        MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ_ROUTING_KEY,
      );

      // consume recommendation dlq
      await channel.consume(
        MESSAGE_BUS_CONFIG.RECOMMENDATION_DLQ,
        async (msg: ConsumeMessage | null) => {
          if (msg) {
            this.logger.warn(
              `recommendation dlq Consumer received message: ${msg.content.toString()}`,
            );
            await this.handler.handleRecommendationDlq(msg, channel);
          }
        },
      );
    });
  }
}
