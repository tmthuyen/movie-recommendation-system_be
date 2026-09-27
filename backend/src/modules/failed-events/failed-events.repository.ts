import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FailedEvent } from './entities/failed-event.entity';

export const IFailedEventRepository = Symbol('IFailedEventRepository');

export interface IFailedEventRepository {
  save(event: Partial<FailedEvent>): Promise<FailedEvent>;
  findById(id: string): Promise<FailedEvent | null>;
  findAndCount(options: {
    page: number;
    limit: number;
    status?: string;
  }): Promise<[FailedEvent[], number]>;
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

  async findAndCount({
    page,
    limit,
    status,
  }: {
    page: number;
    limit: number;
    status?: string;
  }): Promise<[FailedEvent[], number]> {
    const qb = this.repo.createQueryBuilder('fe');
    if (status) {
      qb.andWhere('fe.status = :status', { status });
    }
    qb.orderBy('fe.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    return qb.getManyAndCount();
  }
}
