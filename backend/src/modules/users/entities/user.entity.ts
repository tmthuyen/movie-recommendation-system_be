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
import { Review } from '@/modules/reviews/entities/review.entity';

@Entity('users')
export class User extends BaseAuditEntity {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @OneToMany(() => Rating, rating => rating.user)
  ratings: Rating[];

  @OneToMany(() => Review, review => review.user)
  reviews: Review[];

  @Index({ unique: true })
  @Column({ nullable: false })
  email: string;

  @Column({ name: 'phone_number', nullable: true })
  phoneNumber: string;

  @Column({ name: 'full_name', nullable: false })
  fullName: string;

  @Column()
  password: string;

  @ManyToMany(() => Role, role => role.users)
  @JoinTable({ name: 'user_roles' })
  roles: Role[];
}
