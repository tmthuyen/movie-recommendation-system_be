import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';

@Entity('seed_ratings')
@Unique('UQ_SEEDRATING_USERID_MOVIEID', ['movieId', 'userId'])
export class SeedRating extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'float' }) // base 10
  score: number;

  @Column({ name: 'user_id', type: 'varchar' })
  userId: string;

  @Column({ name: 'movie_id', type: 'bigint' })
  movieId: number;
}
