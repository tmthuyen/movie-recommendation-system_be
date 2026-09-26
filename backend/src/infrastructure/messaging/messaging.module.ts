import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MESSAGE_BUS_CLIENT, MESSAGE_BUS_CONFIG } from './messaging.constants';
import { EventPublisherService } from './event-publisher.service';

@Global()
@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: MESSAGE_BUS_CLIENT,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [
              configService.get<string>(
                'RABBITMQ_URL',
                'amqp://guest:guest@localhost:5672',
              ),
            ],
            queue: configService.get<string>(
              'RABBITMQ_QUEUE',
              MESSAGE_BUS_CONFIG.queue,
            ),
            queueOptions: { durable: true },
            persistent: true,
          },
        }),
      },
    ]),
  ],
  providers: [EventPublisherService],
  exports: [EventPublisherService],
})
export class MessagingModule {}
