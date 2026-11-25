import {
  Column,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';

@Entity('genres')
export class Genre extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('UQ_GENRES_NAME', { unique: true })
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'en_name', type: 'varchar', length: 100, nullable: true })
  enName?: string;

  @ManyToMany(() => Movie, movie => movie.genres)
  movies: Movie[];
}
