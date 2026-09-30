import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { IFailedEventRepository } from './failed-events.repository';
import { FailedEventStatus } from './entities/failed-event.entity';
import { EventPublisherService } from '@/infrastructure/messaging/event-publisher.service';
import { MESSAGE_BUS_CONFIG } from '@/infrastructure/messaging/messaging.constants';
import { EventEnvelope } from '@/infrastructure/messaging/event.types';
import { FailedEventDto } from './dtos/failed-event.dto';

@Injectable()
export class FailedEventsService {
  private readonly logger = new Logger(FailedEventsService.name);

  constructor(
    @Inject(IFailedEventRepository)
    private readonly repo: IFailedEventRepository,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  async findAll(page: number, limit: number, status?: string) {
    const [data, total] = await this.repo.findAndCount({ page, limit, status });
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async retry(id: string) {
    const failedEvent = await this.repo.findById(id);
    if (!failedEvent) {
      throw new NotFoundException('Không tìm thấy failed event');
    }

    try {
      this.logger.log(`Retrying event ${JSON.stringify(failedEvent)}`);

      let exchange = MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE as string;
      if (failedEvent.routingKey.startsWith('user.')) {
        exchange = MESSAGE_BUS_CONFIG.USER_EXCHANGE;
      }
      this.eventPublisher.publish(
        exchange,
        failedEvent.routingKey,
        failedEvent.payload,
        failedEvent.correlationId,
      );

      failedEvent.status = FailedEventStatus.RETRIED_SUCCESS;
      failedEvent.retryCount += 1;
      await this.repo.save(failedEvent);

      return true;
    } catch (error: any) {
      failedEvent.status = FailedEventStatus.RETRIED_FAILED;
      failedEvent.retryCount += 1;
      failedEvent.errorReason = error.message;
      await this.repo.save(failedEvent);
      return false;
    }
  }

  async logFailedEvent(eventDto: FailedEventDto) {
    return this.repo.save({
      ...eventDto,
      status: FailedEventStatus.PENDING,
      retryCount: 0,
    });
  }
}
