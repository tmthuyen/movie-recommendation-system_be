import { Injectable, NotFoundException, Inject, Logger } from '@nestjs/common';
import { IFailedEventRepository } from './failed-events.repository';
import { FailedEvent, FailedEventStatus } from './entities/failed-event.entity';
import { EventPublisherService } from '@/infrastructure/messaging/event-publisher.service';
import { MESSAGE_BUS_CONFIG } from '@/infrastructure/messaging/messaging.constants';
import { FailedEventDto } from './dtos/failed-event.dto';
import { FailedEventSearchDto } from './dtos/failed-event-search.dto';
import { ResultWithPagination } from '@/common/dtos/paginated-result.interface';
import { PaginationUtils } from '@/common/utils/search.util';

@Injectable()
export class FailedEventsService {
  private readonly logger = new Logger(FailedEventsService.name);

  constructor(
    @Inject(IFailedEventRepository)
    private readonly repo: IFailedEventRepository,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  async findAll(
    request: FailedEventSearchDto,
  ): Promise<ResultWithPagination<FailedEvent>> {
    const page = Math.max(request.page ?? 1, 1);
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);

    const filters = [...(request.filters ?? [])];
    if (
      request.status &&
      !filters.some(filter => filter.toLowerCase().startsWith('status:'))
    ) {
      filters.push(`status:eq:${request.status}`);
    }

    const [data, total] = await this.repo.search({
      ...request,
      page,
      limit,
      filters,
    });

    return {
      result: data,
      pagination: PaginationUtils.getPaginationMeta(page, limit, total),
    };
  }

  /** Chọn exchange đích theo prefix của routing key; routing key ngoài danh sách dùng exchange movie. */
  private resolveExchange(routingKey: string): string {
    if (routingKey.startsWith('movie.')) {
      return MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE;
    }
    if (routingKey.startsWith('user.')) {
      return MESSAGE_BUS_CONFIG.USER_EXCHANGE;
    }
    if (routingKey.startsWith('interaction.')) {
      return MESSAGE_BUS_CONFIG.INTERACTION_EXCHANGE;
    }
    if (routingKey.startsWith('auth.')) {
      return MESSAGE_BUS_CONFIG.AUTH_EXCHANGE;
    }
    return MESSAGE_BUS_CONFIG.MOVIE_EXCHANGE;
  }

  async retry(id: string) {
    const failedEvent = await this.repo.findById(id);
    if (!failedEvent) {
      throw new NotFoundException('Không tìm thấy failed event');
    }

    try {
      this.logger.log(
        `Retry failed event: id=${failedEvent.id}, routingKey=${failedEvent.routingKey}`,
      );

      await this.eventPublisher.publish(
        this.resolveExchange(failedEvent.routingKey),
        failedEvent.routingKey,
        failedEvent.payload,
        failedEvent.correlationId,
      );

      failedEvent.status = FailedEventStatus.RETRIED_SUCCESS;
      failedEvent.retryCount += 1;
      await this.repo.save(failedEvent);

      return true;
    } catch (error) {
      failedEvent.status = FailedEventStatus.RETRIED_FAILED;
      failedEvent.retryCount += 1;
      let message = '';
      if (error instanceof Error) message = error.message;
      failedEvent.errorReason = message;
      this.logger.warn(
        `Retry failed event thất bại: id=${failedEvent.id}, reason=${message}`,
      );
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
