import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  ManyToMany,
} from 'typeorm';

@Entity('countries')
export class Country extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // idx_country_vi_name
  @Index('IDX_COUNTRIES_VI_NAME', { unique: true })
  @Column({
    name: 'vi_name',
    type: 'varchar',
    length: 50,
  })
  viName: string;

  @Index('IDX_COUNTRIES_EN_NAME', { unique: true })
  @Column({
    name: 'en_name',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  enName: string;

  @Index('IDX_COUNTRIES_CODE', { unique: true })
  @Column({
    name: 'code',
    type: 'varchar',
    length: 2,
    nullable: true,
  })
  code: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  region: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subregion: string;

  @ManyToMany(() => Movie, movie => movie.countries)
  movies: Movie[];
}
