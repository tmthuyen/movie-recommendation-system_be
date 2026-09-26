import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { Rating } from '@/modules/ratings/entities/rating.entity';
import { Comment } from '@/modules/comments/entities/comment.entity';
import { Country } from '@/modules/countries/entities/country.entity';
import { MoviePeople } from '@/modules/movies/entities/movie-people.entity';
import { Genre } from '@/modules/genres/entities/genre.entity';

/*
tmdb_id,title_vi,overview_vi,genres,release_date,poster_path,adult,backdrop_path,
belongs_to_collection,budget,homepage,imdb_id,origin_country,original_language,
original_title,overview,popularity,production_companies,production_countries,
revenue,runtime,softcore,spoken_languages,status,tagline,title,video,vote_average,
vote_count,movieId,is_ai_translated,overview_vi_word_count
131232.0,Due amici,"Bạn bè hai tuổi, Nunzio và Pino, có chung một căn hộ ở Turn. Nunzio làm việc trong một nhà máy nhưng được khởi động bởi căn bệnh của mình. Pino, mặt khác, là một người đàn ông và anh ta luôn luôn là một người đàn ông và anh ta luôn luôn là bởi công việc của mình. Nunzio sẽ rất muốn biết những gì bạn bè của mình đang làm cho một cuộc sống nhưng sẽ không cho anh ta biết neo dành thời gian miễn phí của mình thời gian tốt nhất của mình trong vắng mặt bạn bè của mình. anh ta có thể kết thúc trong tình yêu với Maria, một di chuyển, một tình trạng sức khỏe của mình ...",
"[{'id': 18, 'name': 'Phim Chính Kịch'}]",2002-03-20,/ja7a0XvTUIQ6w1YdvbtytdC1lTF.jpg,False,
/r1boovecPQAZo6vQBLZ4NVeRT2g.jpg,,0,,tt0333373,['IT'],it,Due amici,"Two Sicilian friends, Nunzio and Pino, share the same apartment in Turin. Nunzio works in a factory but is laid off because of his illness. Pino, on the other hand, is a mysterious man and he is always traveling because of his work. Nunzio would very much like to know what his friend is doing for a living but Pino will not tell him. Nunzio spends his free time the best he can in his friend's absences. He ends up falling in love with Maria, a commercial employee, whereas his health condition deteriorates...",1.021,[],"[{'iso_3166_1': 'IT', 'name': 'Italy'}]",0,86,False,"[{'english_name': 'Italian', 'iso_639_1': 'it', 'name': 'Italiano'}]",Released,,Due amici,False,5.4,7,723,True,126

backdrop_path
homepage
imdb_id
origin_country
original_language
budget
revenue
status
video
is_ai_translated
*/

@Entity('movies')
export class Movie {
  @PrimaryColumn({ name: 'id', type: 'bigint' })
  id: number;

  @Column({ name: 'tmdb_id', type: 'bigint', nullable: true })
  tmdbId: number;

  @Column({ name: 'imdb_id', type: 'varchar', length: 50, nullable: true })
  imdbId: string;

  @Column({ name: 'title', type: 'varchar', length: 255, nullable: true })
  title: string;

  @Column({ name: 'title_vi', type: 'varchar', length: 255, nullable: true })
  titleVi: string;

  @Column({ name: 'overview', type: 'text', nullable: true })
  overview: string;

  @Column({ name: 'overview_vi', type: 'text', nullable: true })
  overviewVi: string;

  @Column({ name: 'release_date', type: 'varchar', length: 20, nullable: true })
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

  @Column({ name: 'vote_average', type: 'float', nullable: true })
  voteAverage: number;

  @Column({ name: 'vote_count', type: 'bigint', default: 0 })
  voteCount: number;

  @Column({ name: 'view_count', type: 'bigint', default: 0 })
  viewCount: number;

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

  @OneToMany(() => MoviePeople, moviePeople => moviePeople.movie)
  moviePeoples: MoviePeople[];

  @ManyToOne(() => Country, country => country.movies)
  @JoinColumn({ name: 'country_id' })
  country: Country;

  @OneToMany(() => Rating, rating => rating.movie)
  ratings: Rating[];

  @OneToMany(() => Comment, comment => comment.movie)
  comments: Comment[];
}
