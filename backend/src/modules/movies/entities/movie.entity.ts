import {
  Column,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Rating } from '@/modules/ratings/entities/rating.entity';
import { Comment } from '@/modules/comments/entities/comment.entity';
import { Country } from '@/modules/countries/entities/country.entity';
import { MoviePeople } from '@/modules/movies/entities/movie-people.entity';
import { Genre } from '@/modules/genres/entities/genre.entity';
import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';
import { Interaction } from '@/modules/interactions/entities/interaction.entity';

@Entity('movies')
export class Movie extends BaseAuditEntity {
  /** Note about bigint type: bigint column type, used in SQL databases, doesn't fit into the regular number type and maps property to a string instead.
   * TypeORM url: https://typeorm.io/docs/entity/entities/
   */
  @PrimaryGeneratedColumn({
    name: 'id',
    type: 'bigint',
  })
  id: number;

  @Index('IDX_MOVIES_TMDB_ID')
  @Column({ name: 'tmdb_id', type: 'bigint', nullable: true, unique: true })
  tmdbId: number;

  @Index('IDX_MOVIES_IMDB_ID')
  @Column({
    name: 'imdb_id',
    type: 'varchar',
    length: 50,
    nullable: true,
    unique: true,
  })
  imdbId: string;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title: string;

  @Column({ name: 'title_vi', type: 'varchar', length: 255, nullable: true })
  titleVi: string;

  @Column({ name: 'overview', type: 'text', nullable: true })
  overview: string;

  @Column({ name: 'overview_vi', type: 'text', nullable: true })
  overviewVi: string;

  @Index('IDX_MOVIES_RELEASE_DATE')
  @Column({ name: 'release_date', type: 'date', nullable: true })
  releaseDate: string;

  @Column({ name: 'poster_path', type: 'varchar', length: 255, nullable: true })
  posterPath: string;

  @Column({
    name: 'backdrop_path',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  backdropPath: string;

  @Column({ name: 'homepage', type: 'varchar', length: 255, nullable: true })
  homepage: string;

  @Column({
    name: 'origin_country',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  originCountry: string;

  @Column({
    name: 'original_language',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  originalLanguage: string;

  @Column({ name: 'budget', type: 'bigint', default: 0 })
  budget: number;

  @Column({ name: 'revenue', type: 'bigint', default: 0 })
  revenue: number;

  @Column({ name: 'status', type: 'varchar', length: 50, nullable: true })
  status: string;

  @Column({ name: 'video', type: 'boolean', default: false })
  video: boolean;

  @Column({ name: 'is_ai_translated', type: 'boolean', default: false })
  isAiTranslated: boolean;

  // rating tmdb
  @Column({ name: 'tmdb_rating', type: 'float', nullable: true })
  tmdbRating: number;

  @Column({ name: 'vote_average', type: 'float', nullable: true })
  voteAverage: number;

  @Column({ name: 'vote_count', type: 'bigint', default: 0 })
  voteCount: number;

  @Index('IDX_MOVIES_VIEW_COUNT')
  @Column({ name: 'view_count', type: 'bigint', default: 0 })
  viewCount: number;

  @Index('IDX_MOVIES_LIKE_COUNT')
  @Column({ name: 'like_count', type: 'bigint', default: 0 })
  likeCount: number;

  @ManyToMany(() => Genre, genre => genre.movies, {
    cascade: ['remove'],
  })
  @JoinTable({
    name: 'movie_genres',
    joinColumn: {
      name: 'movie_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_movie_genres_movie',
    },
    inverseJoinColumn: {
      name: 'genre_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_movie_genres_genre',
    },
  })
  genres: Genre[];

  @ManyToMany(() => Country, country => country.movies, {
    cascade: ['remove'],
  })
  @JoinTable({
    name: 'movie_countries',
    joinColumn: {
      name: 'movie_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_movie_countries_movie',
    },
    inverseJoinColumn: {
      name: 'country_id',
      referencedColumnName: 'id',
      foreignKeyConstraintName: 'fk_movie_countries_country',
    },
  })
  countries: Country[];

  @OneToMany(() => MoviePeople, moviePeople => moviePeople.movie)
  moviePeoples: MoviePeople[];

  @OneToMany(() => Rating, rating => rating.movie)
  ratings: Rating[];

  @OneToMany(() => Comment, comment => comment.movie)
  comments: Comment[];

  @OneToMany(() => Interaction, interaction => interaction.movie)
  interactions: Interaction[];
}
