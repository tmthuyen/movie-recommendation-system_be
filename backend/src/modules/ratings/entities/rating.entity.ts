import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';

@Entity('ratings')
@Unique('UQ_RATING_USER_MOVIE', ['user', 'movie'])
export class Rating extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'float' })
  rating: number;

  @Column({ type: 'timestamp', nullable: true })
  timestamp: Date;

  @ManyToOne(() => User, user => user.ratings, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'user_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_rating_user_id',
  })
  user: User;

  @ManyToOne(() => Movie, movie => movie.ratings, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'movie_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_rating_movie_id',
  })
  movie: Movie;
}
