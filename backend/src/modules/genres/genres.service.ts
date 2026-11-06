import { Injectable, Inject, NotFoundException, Logger } from '@nestjs/common';
import { CreateGenreDto } from './dto/create-genre.dto';
import { UpdateGenreDto } from './dto/update-genre.dto';
import { IGenreRepository } from './genres.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';
import { Genre } from './entities/genre.entity';
import { ICacheService } from '@/infrastructure/cache/redis-cache.service';
import { CacheKeys, CacheTtl } from '@/infrastructure/cache/cache.keys';
import { GenreListCacheSchema } from '@/infrastructure/cache/cache.schemas';

@Injectable()
export class GenresService {
  private readonly logger = new Logger(GenresService.name);
  constructor(
    @Inject(IGenreRepository)
    private readonly repo: IGenreRepository,
    @Inject(ICacheService) private readonly cache: ICacheService,
  ) {}

  async create(createGenreDto: CreateGenreDto) {
    const created = await this.repo.create(createGenreDto);
    await this.cache.incr(CacheKeys.genre.listVersion());
    return created;
  }

  async findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Genre>> {
    const { page = 1, limit = 10, keyword } = paginationDto;
    const version = await this.cache.getCounter(CacheKeys.genre.listVersion());

    return this.cache.getOrLoad<PaginatedResult<Genre>>({
      key: CacheKeys.genre.list(version, page, limit, keyword),
      schema: GenreListCacheSchema,
      ttlSeconds: CacheTtl.lookup,
      loader: async () => {
        const result = await this.repo.findAll(paginationDto);
        this.logger.log(
          `Fetched ${result.data.length} genres (page ${result.page}/${result.totalPages})`,
        );
        return result;
      },
    });
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
    const updated = await this.repo.update(genre.id, updateGenreDto);
    await this.cache.incr(CacheKeys.genre.listVersion());
    return updated;
  }

  async remove(id: number) {
    const genre = await this.findOne(id); // Check exists
    await this.repo.remove(genre.id);
    await this.cache.incr(CacheKeys.genre.listVersion());
    return { success: true };
  }
}
