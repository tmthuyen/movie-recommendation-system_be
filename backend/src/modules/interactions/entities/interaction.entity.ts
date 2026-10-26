import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { User } from '@/modules/users/entities/user.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum InteractionType {
  LIKE = 'like',
  RATING = 'rating',
  COMMENT = 'comment',
  CLICK = 'click',
}

/** Thang điểm 5 — score biểu thị **độ tin cậy** của tín hiệu, không phải điểm thưởng. */
export const MAX_INTERACTION_SCORE = 5;

export const InteractionScoreMap: Record<InteractionType, number> = {
  [InteractionType.LIKE]: 5,
  [InteractionType.COMMENT]: 4,
  [InteractionType.CLICK]: 1,
  [InteractionType.RATING]: 0, // Điểm động: đúng bằng số sao người dùng nhập (1..5)
};
@Entity('interactions')
// Không unique: một user có thể comment/click/rating nhiều lần cho cùng một phim.
@Index(['user', 'movie', 'type'])
export class Interaction extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'float', default: 0 })
  score: number;

  @Column()
  type: InteractionType;

  @ManyToOne(() => User, user => user.interactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Movie, movie => movie.interactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movie_id' })
  movie: Movie;
}
