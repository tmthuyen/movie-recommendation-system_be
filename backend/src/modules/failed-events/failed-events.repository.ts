import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { SearchUtils } from '@/common/utils/search.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FailedEvent } from './entities/failed-event.entity';

export const IFailedEventRepository = Symbol('IFailedEventRepository');

export interface IFailedEventRepository {
  save(event: Partial<FailedEvent>): Promise<FailedEvent>;
  findById(id: string): Promise<FailedEvent | null>;
  search(request: BaseSearchRequest): Promise<[FailedEvent[], number]>;
}

@Injectable()
export class FailedEventRepository implements IFailedEventRepository {
  constructor(
    @InjectRepository(FailedEvent)
    private readonly repo: Repository<FailedEvent>,
  ) {}

  async save(event: Partial<FailedEvent>): Promise<FailedEvent> {
    return this.repo.save(event);
  }

  async findById(id: string): Promise<FailedEvent | null> {
    return this.repo.findOne({ where: { id } });
  }

  async search(request: BaseSearchRequest): Promise<[FailedEvent[], number]> {
    const {
      page = 1,
      limit = 10,
      keyword,
      filters = [],
      sort = ['createdAt:DESC'],
    } = request;

    const qb = this.repo.createQueryBuilder('fe');

    // keyword search: source, queue, routing key, event, error
    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      qb.andWhere(
        '(fe.source ILIKE :keyword OR fe.queueName ILIKE :keyword OR fe.routingKey ILIKE :keyword OR fe.eventId ILIKE :keyword OR fe.eventType ILIKE :keyword OR fe.correlationId ILIKE :keyword OR fe.errorReason ILIKE :keyword)',
        { keyword: `%${trimmedKeyword}%` },
      );
    }

    // ====================
    // START FILTER <= >=
    // ====================

    const fieldMap: Record<string, string> = {
      id: 'fe.id',
      status: 'fe.status',
      source: 'fe.source',
      queueName: 'fe.queueName',
      routingKey: 'fe.routingKey',
      eventId: 'fe.eventId',
      eventType: 'fe.eventType',
      correlationId: 'fe.correlationId',
      retryCount: 'fe.retryCount',
      createdAt: 'fe.createdAt',
      updatedAt: 'fe.updatedAt',
    };

    SearchUtils.applyFilters(qb, filters || [], fieldMap);

    // ====================
    // END FILTER <= >=
    // ====================

    // ====================
    // START SORT
    // ====================

    const sortMap = {
      id: 'fe.id',
      status: 'fe.status',
      source: 'fe.source',
      queueName: 'fe.queueName',
      routingKey: 'fe.routingKey',
      eventType: 'fe.eventType',
      retryCount: 'fe.retryCount',
      createdAt: 'fe.createdAt',
      updatedAt: 'fe.updatedAt',
    };

    const sortOptions = SearchUtils.parseSort(
      sort.join(','),
      Object.keys(sortMap),
    );

    for (const option of sortOptions) {
      const column = sortMap[option.field] as string | undefined;
      if (!column) {
        throw new BadRequestException(
          `Sort field không hợp lệ: ${option.field}`,
        );
      }
      qb.addOrderBy(column, option.direction);
    }

    // stable sort by id
    if (!sortOptions.some(option => option.field === 'id')) {
      qb.addOrderBy('fe.id', 'ASC');
    }

    // ====================
    // END SORT
    // ====================

    qb.skip((page - 1) * limit).take(limit);

    return qb.getManyAndCount();
  }
}
