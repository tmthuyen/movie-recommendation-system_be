import { Column, Entity, ManyToMany, PrimaryColumn } from 'typeorm';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';

@Entity('genres')
export class Genre extends BaseAuditEntity {
  @PrimaryColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @ManyToMany(() => Movie, movie => movie.genres)
  movies: Movie[];
}
