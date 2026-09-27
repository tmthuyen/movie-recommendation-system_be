import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateMovieDto } from './dto/create-movie.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { IMovieRepository } from './movies.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { EventPublisherService } from '@/infrastructure/messaging/event-publisher.service';

@Injectable()
export class MoviesService {
  constructor(
    @Inject(IMovieRepository)
    private readonly repo: IMovieRepository,
    private readonly eventPublisher: EventPublisherService,
  ) {}

  private mapDtoToEntity(dto: any) {
    const { genreIds, countryId, peopleIds, ...rest } = dto;
    const entity: any = { ...rest };
    if (genreIds) entity.genres = genreIds.map((id: number) => ({ id }));
    if (countryId) entity.country = { id: countryId };
    if (peopleIds)
      entity.moviePeoples = peopleIds.map((id: number) => ({ people: { id } }));
    return entity;
  }

  async create(createMovieDto: CreateMovieDto) {
    const entity = this.mapDtoToEntity(createMovieDto);
    const saved = await this.repo.create(entity);
    
    // Publish movie.created event
    this.eventPublisher.publish('movie.created', { movieId: saved.id, title: saved.title });
    
    return saved;
  }

  async findAll(paginationDto: PaginationDto) {
    return this.repo.findAll(paginationDto);
  }

  async findOne(id: number) {
    const movie = await this.repo.findById(id);
    if (!movie) {
      throw new NotFoundException(`Movie with ID ${id} not found`);
    }
    return movie;
  }

  async update(id: number, updateMovieDto: UpdateMovieDto) {
    const movie = await this.findOne(id); // Check exists
    const entity = this.mapDtoToEntity(updateMovieDto);
    
    // Check if relevant fields changed
    const aiFields = ['title', 'titleVi', 'overview', 'overviewVi', 'genreIds', 'peopleIds'];
    let hasChanges = false;
    for (const field of aiFields) {
      if (updateMovieDto[field as keyof UpdateMovieDto] !== undefined && 
          updateMovieDto[field as keyof UpdateMovieDto] !== movie[field as keyof typeof movie]) {
        hasChanges = true;
        break;
      }
    }

    const updated = await this.repo.update(movie.id, entity);

    if (hasChanges && updated) {
      this.eventPublisher.publish('movie.updated', { movieId: updated.id, title: updated.title });
    }

    return updated;
  }

  async remove(id: number) {
    const movie = await this.findOne(id); // Check exists
    await this.repo.remove(movie.id);
    return { success: true };
  }
}
