import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';

@Entity('ratings')
export class Rating {
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
