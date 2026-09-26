import { Column, Entity, ManyToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Movie } from '@/modules/movies/entities/movie.entity';

@Entity('genres')
export class Genre {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @ManyToMany(() => Movie, movie => movie.genres)
  movies: Movie[];
}
