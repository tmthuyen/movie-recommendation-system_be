import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GenresService } from './genres.service';
import { GenresController } from './genres.controller';
import { Genre } from './entities/genre.entity';
import { GenreRepository, IGenreRepository } from './genres.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Genre])],
  controllers: [GenresController],
  providers: [
    {
      provide: IGenreRepository,
      useClass: GenreRepository,
    },
    GenresService,
  ],
  exports: [GenresService],
})
export class GenresModule {}
