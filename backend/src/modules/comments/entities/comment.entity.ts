import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, user => user.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Movie, movie => movie.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movie_id', referencedColumnName: 'id' })
  movie: Movie;
}
