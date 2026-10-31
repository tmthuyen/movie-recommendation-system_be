import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { CreateGenreDto } from './dto/create-genre.dto';
import { UpdateGenreDto } from './dto/update-genre.dto';
import { IGenreRepository } from './genres.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';

@Injectable()
export class GenresService {
  private readonly logger = new Logger(GenresService.name);
  constructor(
    @Inject(IGenreRepository)
    private readonly repo: IGenreRepository,
  ) {}

  async create(createGenreDto: CreateGenreDto) {
    return await this.repo.create(createGenreDto);
  }

  async findAll(paginationDto: PaginationDto) {
    const result = await this.repo.findAll(paginationDto);
    this.logger.log(
      `Fetched ${result.data.length} genres (page ${result.page}/${result.totalPages})`,
    );
    return result;
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
