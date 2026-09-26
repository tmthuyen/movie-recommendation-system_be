import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

@Entity('countries')
export class Country extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  name: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @OneToMany(() => Movie, movie => movie.country)
  movies: Movie[];
}
