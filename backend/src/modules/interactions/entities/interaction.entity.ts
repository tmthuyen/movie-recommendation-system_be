import { Movie } from '@/modules/movies/entities/movie.entity';
import { User } from '@/modules/users/entities/user.entity';
import {
  BaseEntity,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum InteractionType {
  LIKE = 'like',
  DISLIKE = 'dislike',
  FAVORITE = 'favorite',
  WATCHLIST = 'watchlist',
  RATING = 'rating',
  COMMENT = 'comment',
  CLICK = 'click',
}

export const InteractionScoreMap: Record<InteractionType, number> = {
  [InteractionType.LIKE]: 10,
  [InteractionType.DISLIKE]: 1,
  [InteractionType.FAVORITE]: 7,
  [InteractionType.WATCHLIST]: 3,
  [InteractionType.COMMENT]: 5,
  [InteractionType.CLICK]: 2,
  [InteractionType.RATING]: 0, // Dynamic, depends on user input
};
@Entity('interactions')
@Index(['user', 'movie', 'type'], { unique: true })
export class Interaction extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
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
