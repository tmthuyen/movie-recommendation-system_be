import { Global, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as amqp from 'amqp-connection-manager';
import { MESSAGE_BUS_CLIENT, MESSAGE_BUS_CONFIG } from './messaging.constants';
import { EventPublisherService } from './event-publisher.service';
import { UserProducer } from './producers/user.producer';
import { MovieProducer } from './producers/movie.producer';
import { InteractionProducer } from './producers/interaction.producer';
import {
  RecommendationConsumer,
  RecommendationHandler,
} from './consumers/recommendation-dlq.consumer';
import {
  InteractionConsumer,
  InteractionHandler,
} from './consumers/interaction-dlq.consumer';
import { FailedEventsModule } from '@/modules/failed-events/failed-events.module';

@Global()
@Module({
  imports: [ConfigModule, FailedEventsModule],
  providers: [
    {
      provide: MESSAGE_BUS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const url = configService.get<string>(
          'RABBITMQ_URL',
          'amqp://guest:guest@localhost:5672',
        );
        const connection = amqp.connect([url]);

        const channelWrapper = connection.createChannel({
          json: true,
          publishTimeout: 3000, // 3s
          setup: function (channel: any) {
            return Promise.all([
              channel.assertExchange(
                MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE,
                'topic',
                { durable: true },
              ),
              channel.assertExchange(
                MESSAGE_BUS_CONFIG.USER_EXCHANGE,
                'topic',
                { durable: true },
              ),
              channel.assertExchange(
                MESSAGE_BUS_CONFIG.INTERACTION_EXCHANGE,
                'topic',
                { durable: true },
              ),
            ]);
          },
        });

        return channelWrapper;
      },
    },
    EventPublisherService,
    RecommendationConsumer,
    RecommendationHandler,
    InteractionConsumer,
    InteractionHandler,
    UserProducer,
    MovieProducer,
    InteractionProducer,
  ],
  exports: [EventPublisherService, MESSAGE_BUS_CLIENT, InteractionProducer],
})
export class MessagingModule implements OnModuleDestroy {
  constructor() {}

  onModuleDestroy() {
    // Cleanup will be handled by amqp-connection-manager on exit
  }
}
