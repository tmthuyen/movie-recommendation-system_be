import { Movie } from '@/modules/movies/entities/movie.entity';
import { People } from '@/modules/peoples/entities/people.entity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('movie_peoples')
export class MoviePeople {
  @PrimaryGeneratedColumn({
    name: 'id',
    type: 'bigint',
  })
  id: number;

  @ManyToOne(() => Movie, movie => movie.moviePeoples, { cascade: ['remove'] })
  @JoinColumn({
    name: 'movie_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_movie_peoples_movie',
  })
  movie: Movie;

  @ManyToOne(() => People, people => people.moviePeoples, {
    cascade: ['remove'],
  })
  @JoinColumn({
    name: 'people_id',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'fk_movie_peoples_people',
  })
  people: People;

  @Column({ type: 'varchar', length: 50, default: 'actor' })
  role: string;
}
