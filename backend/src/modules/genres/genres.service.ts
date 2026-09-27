import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateGenreDto } from './dto/create-genre.dto';
import { UpdateGenreDto } from './dto/update-genre.dto';
import { IGenreRepository } from './genres.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';

@Injectable()
export class GenresService {
  constructor(
    @Inject(IGenreRepository)
    private readonly repo: IGenreRepository,
  ) {}

  async create(createGenreDto: CreateGenreDto) {
    return await this.repo.create(createGenreDto);
  }

  async findAll(paginationDto: PaginationDto) {
    return await this.repo.findAll(paginationDto);
  }

  async findOne(id: number) {
    const genre = await this.repo.findById(id);
    if (!genre) {
      throw new NotFoundException(`Genre with ID ${id} not found`);
    }
    return genre;
  }

  async update(id: number, updateGenreDto: UpdateGenreDto) {
    const genre = await this.findOne(id); // Check exists
    return await this.repo.update(genre.id, updateGenreDto);
  }

  async remove(id: number) {
    const genre = await this.findOne(id); // Check exists
    await this.repo.remove(genre.id);
    return { success: true };
  }
}
