import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateMovieDto } from './dto/create-movie.dto';
import { UpdateMovieDto } from './dto/update-movie.dto';
import { IMovieRepository } from './movies.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { EventPublisherService } from '@/infrastructure/messaging/event-publisher.service';
import { DataSource } from 'typeorm';
import { EventsGateway } from '@/modules/events/events.gateway';
import {
  Interaction,
  InteractionType,
  InteractionScoreMap,
} from '@/modules/interactions/entities/interaction.entity';
import { Movie } from './entities/movie.entity';
import { Genre } from '@/modules/genres/entities/genre.entity';
import { Country } from '@/modules/countries/entities/country.entity';
import { People } from '@/modules/peoples/entities/people.entity';
import { BadRequestException } from '@nestjs/common';

@Injectable()
export class MoviesService {
  constructor(
    @Inject(IMovieRepository)
    private readonly repo: IMovieRepository,
    private readonly eventPublisher: EventPublisherService,
    private readonly dataSource: DataSource,
    private readonly eventsGateway: EventsGateway,
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

  private async validateRelations(dto: any) {
    const { genreIds, countryId, peopleIds } = dto;
    if (genreIds && genreIds.length > 0) {
      const count = await this.dataSource.getRepository(Genre).count({
        where: genreIds.map((id: number) => ({ id })),
      });
      if (count !== genreIds.length)
        throw new BadRequestException('Một hoặc nhiều thể loại không tồn tại');
    }
    if (countryId) {
      const exists = await this.dataSource
        .getRepository(Country)
        .findOne({ where: { id: countryId } });
      if (!exists) throw new BadRequestException('Quốc gia không tồn tại');
    }
    if (peopleIds && peopleIds.length > 0) {
      const count = await this.dataSource.getRepository(People).count({
        where: peopleIds.map((id: number) => ({ id })),
      });
      if (count !== peopleIds.length)
        throw new BadRequestException('Một hoặc nhiều nhân vật không tồn tại');
    }
  }

  async create(createMovieDto: CreateMovieDto) {
    await this.validateRelations(createMovieDto);
    const entity = this.mapDtoToEntity(createMovieDto);
    const saved = await this.repo.create(entity);

    // Fetch full movie with relations for queue
    const fullMovie = await this.repo.findById(saved.id);

    // Publish movie.created event
    if (fullMovie) {
      this.eventPublisher.publish('movie.created', {
        movieId: fullMovie.id,
        title: fullMovie.title,
        titleVi: fullMovie.titleVi,
        overview: fullMovie.overview,
        overviewVi: fullMovie.overviewVi,
        genres: fullMovie.genres?.map(g => g.name) || [],
      });
    }

    return saved;
  }

  async findAll(paginationDto: PaginationDto) {
    return this.repo.findAll(paginationDto);
  }

  async findOne(id: number) {
    const movie = await this.repo.findById(id);
    if (!movie) {
      throw new NotFoundException(`Không tìm thấy phim với ID ${id}`);
    }
    return movie;
  }

  async update(id: number, updateMovieDto: UpdateMovieDto) {
    const movie = await this.findOne(id); // Check exists
    await this.validateRelations(updateMovieDto);
    const entity = this.mapDtoToEntity(updateMovieDto);

    // Check if relevant fields changed
    const aiFields = [
      'title',
      'titleVi',
      'overview',
      'overviewVi',
      'genreIds',
      'peopleIds',
    ];
    let hasChanges = false;
    for (const field of aiFields) {
      if (
        updateMovieDto[field as keyof UpdateMovieDto] !== undefined &&
        updateMovieDto[field as keyof UpdateMovieDto] !==
          movie[field as keyof typeof movie]
      ) {
        hasChanges = true;
        break;
      }
    }

    const updated = await this.repo.update(movie.id, entity);

    if (hasChanges && updated) {
      const fullMovie = await this.repo.findById(updated.id);
      if (fullMovie) {
        this.eventPublisher.publish('movie.updated', {
          movieId: fullMovie.id,
          title: fullMovie.title,
          titleVi: fullMovie.titleVi,
          overview: fullMovie.overview,
          overviewVi: fullMovie.overviewVi,
          genres: fullMovie.genres?.map(g => g.name) || [],
        });
      }
    }

    return updated;
  }

  async remove(id: number) {
    const movie = await this.findOne(id); // Check exists
    await this.repo.remove(movie.id);
    return { success: true };
  }

  async incrementViewCount(id: number, userId?: string) {
    const movie = await this.findOne(id);

    await this.dataSource.transaction(async manager => {
      // 1. Increment view count in Movie
      movie.viewCount = Number(movie.viewCount) + 1;
      await manager.update(Movie, movie.id, { viewCount: movie.viewCount });

      // 2. Log interaction if user is logged in
      if (userId) {
        const existingInteraction = await manager.findOne(Interaction, {
          where: {
            user: { id: userId } as any,
            movie: { id: movie.id } as any,
            type: InteractionType.CLICK,
          },
        });

        if (existingInteraction) {
          // Anti-spam for CLICK: do not increase score, just update (e.g. if we had updatedAt)
          // For now, we do nothing to avoid spamming the database with duplicate clicks.
        } else {
          const interaction = manager.create(Interaction, {
            score: InteractionScoreMap[InteractionType.CLICK],
            type: InteractionType.CLICK,
            movie: { id: movie.id } as any,
            user: { id: userId } as any,
          });
          await manager.save(interaction);
        }
      }
    });

    // 3. Emit real-time event
    this.eventsGateway.broadcastViewCount(movie.id, movie.viewCount);

    return { viewCount: movie.viewCount };
  }
}
