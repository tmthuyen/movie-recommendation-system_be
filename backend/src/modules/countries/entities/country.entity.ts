import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';

@Entity('countries')
export class Country extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 50 })
  vi_name: string;

  @Column({ type: 'varchar', length: 50 })
  en_name: string;

  @Column({ type: 'varchar', length: 2, unique: true, nullable: true })
  code: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  region: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subregion: string;

  // @OneToMany(() => Movie, movie => movie.country)
  // movies: Movie[];
}
