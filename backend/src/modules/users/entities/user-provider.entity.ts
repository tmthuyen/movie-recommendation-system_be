import { BaseAuditEntity } from '@common/audits/baseaudit.entity';
import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('user_providers')
@Index(['provider', 'providerId'], { unique: true })
export class UserProvider extends BaseAuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', nullable: false })
  userId: string;

  @Column({ nullable: false })
  provider: string;

  @Column({ name: 'provider_id', nullable: false })
  providerId: string;
}
