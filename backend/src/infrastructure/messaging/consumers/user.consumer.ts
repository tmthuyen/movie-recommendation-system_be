// import {
//   Inject,
//   Injectable,
//   Logger,
//   OnModuleInit,
// } from '@nestjs/common';

// import type {
//   Channel,
//   ConsumeMessage,
// } from 'amqplib';

// import type {
//   ChannelWrapper,
// } from 'amqp-connection-manager';

// import {
//   RABBITMQ_CHANNEL,
// } from '../../../infrastructure/messaging/rabbitmq.constants';

// import {
//   USER_TOPOLOGY,
// } from '../../../infrastructure/messaging/topology/user.topology';

// import { UserEvent } from '../../domain/events/user.events';

// @Injectable()
// export class UserConsumer implements OnModuleInit {
//   private readonly logger = new Logger(UserConsumer.name);

//   constructor(
//     @Inject(RABBITMQ_CHANNEL)
//     private readonly channel: ChannelWrapper,
//   ) {}

//   async onModuleInit(): Promise<void> {
//     await this.channel.addSetup(
//       async (channel: Channel) => {
//         await this.setupTopology(channel);

//         await channel.consume(
//           USER_TOPOLOGY.queue.recommendation,
//           async (message) => {
//             if (!message) {
//               return;
//             }

//             await this.handleMessage(channel, message);
//           },
//           {
//             noAck: false,
//           },
//         );

//         this.logger.log(
//           `UserConsumer listening on ${USER_TOPOLOGY.queue.recommendation}`,
//         );
//       },
//     );
//   }

//   private async setupTopology(
//     channel: Channel,
//   ): Promise<void> {
//     await channel.assertExchange(
//       USER_TOPOLOGY.exchange.events,
//       'topic',
//       {
//         durable: true,
//       },
//     );

//     await channel.assertQueue(
//       USER_TOPOLOGY.queue.recommendation,
//       {
//         durable: true,

//         arguments: {
//           'x-dead-letter-exchange':
//             USER_TOPOLOGY.exchange.dlx,

//           'x-dead-letter-routing-key':
//             USER_TOPOLOGY.routingKey.dlq,
//         },
//       },
//     );

//     await channel.bindQueue(
//       USER_TOPOLOGY.queue.recommendation,
//       USER_TOPOLOGY.exchange.events,
//       'user.#',
//     );

//     await channel.assertExchange(
//       USER_TOPOLOGY.exchange.dlx,
//       'topic',
//       {
//         durable: true,
//       },
//     );

//     await channel.assertQueue(
//       USER_TOPOLOGY.queue.dlq,
//       {
//         durable: true,
//       },
//     );

//     await channel.bindQueue(
//       USER_TOPOLOGY.queue.dlq,
//       USER_TOPOLOGY.exchange.dlx,
//       USER_TOPOLOGY.routingKey.dlq,
//     );
//   }

//   private async handleMessage(
//     channel: Channel,
//     message: ConsumeMessage,
//   ): Promise<void> {
//     try {
//       const routingKey = message.fields.routingKey;

//       const payload = JSON.parse(
//         message.content.toString(),
//       );

//       this.logger.log(
//         `Received user event: ${routingKey}`,
//       );

//       switch (routingKey) {
//         case UserEvent.CREATED:
//           await this.handleUserCreated(payload);
//           break;

//         case UserEvent.UPDATED:
//           await this.handleUserUpdated(payload);
//           break;

//         case UserEvent.DELETED:
//           await this.handleUserDeleted(payload);
//           break;

//         default:
//           throw new Error(
//             `Unsupported user event: ${routingKey}`,
//           );
//       }

//       channel.ack(message);

//     } catch (error) {
//       this.logger.error(
//         'Failed to process user event',
//         error instanceof Error
//           ? error.stack
//           : String(error),
//       );

//       /**
//        * false = do not requeue
//        *
//        * Queue đã cấu hình DLX nên RabbitMQ
//        * sẽ dead-letter message.
//        */
//       channel.nack(
//         message,
//         false,
//         false,
//       );
//     }
//   }

//   private async handleUserCreated(
//     event: any,
//   ): Promise<void> {
//     // application logic
//   }

//   private async handleUserUpdated(
//     event: any,
//   ): Promise<void> {
//     // application logic
//   }

//   private async handleUserDeleted(
//     event: any,
//   ): Promise<void> {
//     // application logic
//   }
// }
