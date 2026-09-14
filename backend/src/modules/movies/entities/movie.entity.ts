import {
  Column,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { Genre } from './genre.entity';
import { Rating } from '@/modules/ratings/entities/rating.entity';
import { Review } from '@/modules/reviews/entities/review.entity';

@Entity('movies')
export class Movie {
  @PrimaryColumn({ name: 'tmdb_id', type: 'int' })
  tmdbId: number;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'title_vi', type: 'varchar', length: 255, nullable: true })
  titleVi: string;

  @Column({ type: 'text', nullable: true })
  overview: string;

  @Column({ name: 'poster_path', type: 'varchar', length: 255, nullable: true })
  posterPath: string;

  @Column({ name: 'release_date', type: 'varchar', length: 20, nullable: true })
  releaseDate: string;

  @Column({ name: 'vote_average', type: 'float', nullable: true })
  voteAverage: number;

  @Column({ name: 'vote_count', type: 'int', default: 0 })
  voteCount: number;

  @ManyToMany(() => Genre, genre => genre.movies)
  @JoinTable({
    name: 'movie_genres',
    joinColumn: { name: 'tmdb_id', referencedColumnName: 'tmdbId' },
    inverseJoinColumn: { name: 'genre_id', referencedColumnName: 'id' },
  })
  genres: Genre[];

  @OneToMany(() => Rating, rating => rating.movie)
  ratings: Rating[];

  @OneToMany(() => Review, review => review.movie)
  reviews: Review[];
}
