import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { People } from '@/modules/peoples/entities/people.entity';
import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

@Entity('movie_peoples')
export class MoviePeople extends BaseAuditEntity {
  @PrimaryColumn({ name: 'movie_id', type: 'bigint' })
  movieId: number;

  @PrimaryColumn({ name: 'people_id', type: 'bigint' })
  peopleId: number;

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
