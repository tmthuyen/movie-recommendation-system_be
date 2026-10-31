import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Index,
} from 'typeorm';

@Entity('countries')
export class Country extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  // idx_country_vi_name
  @Index('idx_country_vi_name')
  @Column({
    name: 'vi_name',
    type: 'varchar',
    length: 50,
  })
  viName: string;

  @Column({
    name: 'en_name',
    type: 'varchar',
    length: 50,
    unique: true,
    nullable: true,
  })
  enName: string;

  @Index('idx_country_code', { unique: true })
  @Column({
    name: 'code',
    type: 'varchar',
    length: 2,
    unique: true,
    nullable: true,
  })
  code: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  region: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  subregion: string;

  // @OneToMany(() => Movie, movie => movie.country)
  // movies: Movie[];
}
