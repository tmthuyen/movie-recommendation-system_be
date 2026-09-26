import { BaseAuditEntity } from '@/common/audits/baseaudit.entity';
import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { MoviePeople } from '@/modules/movies/entities/movie-people.entity';

@Entity('peoples')
export class People extends BaseAuditEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  fullName: string;

  @Column({ type: 'date', nullable: true })
  birthDate: Date;

  @Column({ type: 'varchar', length: 50, nullable: true })
  nationality: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  gender: string;

  @Column({
    name: 'main_role',
    type: 'varchar',
    length: 50,
    nullable: true,
    default: 'actor',
  })
  mainRole: string;

  @OneToMany(() => MoviePeople, moviePeople => moviePeople.people)
  moviePeoples: MoviePeople[];
}
