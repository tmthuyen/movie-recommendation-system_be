import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum FailedEventStatus {
  PENDING = 'PENDING',
  RETRIED_SUCCESS = 'RETRIED_SUCCESS',
  RETRIED_FAILED = 'RETRIED_FAILED',
}

@Entity('failed_events')
export class FailedEvent extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'queue_name', type: 'varchar' })
  queueName: string;

  @Column({ name: 'routing_key', type: 'varchar' })
  routingKey: string;

  @Column({ name: 'correlation_id', type: 'varchar', nullable: true })
  correlationId?: string;

  @Column({ type: 'json' })
  payload: Record<string, any>;

  @Column({ name: 'error_reason', type: 'text', nullable: true })
  errorReason: string;

  @Column({ type: 'varchar', default: FailedEventStatus.PENDING })
  status: FailedEventStatus;

  @Column({ name: 'retry_count', type: 'int', default: 0 })
  retryCount: number;
}
