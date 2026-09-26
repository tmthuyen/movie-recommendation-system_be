import { BaseAuditEntity } from '@common/audits/baseaudit.entity';
import { Role } from '@/modules/roles/entities/role.entity';
import {
  Column,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { Rating } from '@/modules/ratings/entities/rating.entity';
import { Comment } from '@/modules/comments/entities/comment.entity';

export enum UserStatus {
  UNVERIFIED = 'UNVERIFIED',
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  BLOCKED = 'BLOCKED',
}

@Entity('users')
export class User extends BaseAuditEntity {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'varchar', default: UserStatus.UNVERIFIED })
  status: UserStatus;

  @Index({ unique: true })
  @Column({ nullable: false })
  email: string;

  @Column()
  password: string;

  @Column({ name: 'full_name', nullable: false })
  fullName: string;

  @Column({ name: 'phone_number', nullable: true })
  phoneNumber: string;

  @Column({ type: 'date', nullable: true })
  birthDate: Date;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string;

  @ManyToMany(() => Role, role => role.users, {
    cascade: ['remove'],
  })
  @JoinTable({
    name: 'user_roles',
    joinColumn: {
      name: 'user_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_user_roles_user',
    },
    inverseJoinColumn: {
      name: 'role_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_user_roles_role',
    },
  })
  roles: Role[];

  @OneToMany(() => Rating, rating => rating.user)
  ratings: Rating[];

  @OneToMany(() => Comment, comment => comment.user)
  comments: Comment[];
}
