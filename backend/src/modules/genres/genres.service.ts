import {
  Injectable,
  Inject,
  NotFoundException,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { CreateGenreDto } from './dto/create-genre.dto';
import { UpdateGenreDto } from './dto/update-genre.dto';
import { IGenreRepository } from './genres.repository';
import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';
import { Genre } from './entities/genre.entity';
import {
  CACHE_SERVICE,
  type ICacheService,
} from '@/infrastructure/cache/redis-cache.service';
import { CacheKeys, CacheTtl } from '@/infrastructure/cache/cache.keys';
import { GenreListCacheSchema } from '@/infrastructure/cache/cache.schemas';

@Injectable()
export class GenresService {
  private readonly logger = new Logger(GenresService.name);
  constructor(
    @Inject(IGenreRepository)
    private readonly repo: IGenreRepository,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async create(createGenreDto: CreateGenreDto) {
    const created = await this.repo.create(createGenreDto);
    await this.cache.incr(CacheKeys.genre.listVersion());
    return created;
  }

  async findAll(request: BaseSearchRequest): Promise<PaginatedResult<Genre>> {
    const { page = 1, limit = 10, keyword, filters = [], sort } = request;

    // Chỉ cache truy vấn mặc định; filter/sort tuỳ biến đọc thẳng DB.
    const isDefaultQuery =
      (filters?.length ?? 0) === 0 &&
      (!sort || sort.join(',') === 'createdAt:DESC');

    if (!isDefaultQuery) {
      return this.repo.findAll(request);
    }

    const version = await this.cache.getCounter(CacheKeys.genre.listVersion());

    return this.cache.getOrLoad<PaginatedResult<Genre>>({
      key: CacheKeys.genre.list(version, page, limit, keyword),
      schema: GenreListCacheSchema,
      ttlSeconds: CacheTtl.lookup,
      loader: async () => {
        const result = await this.repo.findAll(request);
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
    // check if genre is used in any movie before deleting
    const isUsed = await this.repo.hasMovies(genre.id);
    if (isUsed) {
      throw new BadRequestException(
        `Genre with ID ${id} is used in a movie and cannot be deleted`,
      );
    }
    await this.repo.remove(genre.id);
    await this.cache.incr(CacheKeys.genre.listVersion());
    return { success: true };
  }
}
