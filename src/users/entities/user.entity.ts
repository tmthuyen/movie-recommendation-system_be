import { BaseAuditEntity } from '@/audits/baseaudit.entity';
import { Role } from '@/roles/entities/role.entity';
import {
  Column,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('users')
export class User extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index({ unique: true })
  @Column({ nullable: false })
  email: string;

  @Column({ nullable: true })
  phone_number: string;

  @Column({ nullable: false })
  full_name: string;

  @Column()
  password: string;

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({ name: 'user_roles' })
  roles: Role[];
}
