import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '@/modules/users/entities/user.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';

@Entity('reviews')
export class Review {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User, user => user.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Movie, movie => movie.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tmdb_id', referencedColumnName: 'tmdbId' })
  movie: Movie;
}
