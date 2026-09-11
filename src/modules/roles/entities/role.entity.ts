import { BaseAuditEntity } from '@common/audits/baseaudit.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Exclude } from 'class-transformer';
import {
  Column,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity({ name: 'roles' })
export class Role extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ nullable: false })
  code: string;

  @Column({ nullable: false })
  name: string;

  @Column()
  description: string;

  @ManyToMany(() => User, u => u.roles)
  @Exclude() // no return for API
  users: User[];
}
