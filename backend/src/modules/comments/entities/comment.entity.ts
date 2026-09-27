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
import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';

@Entity('comments')
export class Comment extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => User, user => user.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Movie, movie => movie.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'movie_id', referencedColumnName: 'id' })
  movie: Movie;
}
