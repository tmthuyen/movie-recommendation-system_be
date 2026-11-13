import {
  Injectable,
  Inject,
  NotFoundException,
  Logger,
  ConflictException,
} from '@nestjs/common';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { ICountryRepository } from './countries.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import {
  CACHE_SERVICE,
  type ICacheService,
} from '@/infrastructure/cache/redis-cache.service';
import { CacheKeys, CacheTtl } from '@/infrastructure/cache/cache.keys';
import { CountryListCacheSchema } from '@/infrastructure/cache/cache.schemas';

@Injectable()
export class CountriesService {
  private readonly logger = new Logger(CountriesService.name);

  constructor(
    @Inject(ICountryRepository)
    private readonly repo: ICountryRepository,
    @Inject(CACHE_SERVICE) private readonly cache: ICacheService,
  ) {}

  async create(createCountryDto: CreateCountryDto) {
    // check name or code exists
    const existing = await this.repo.findByNameOrCode(
      createCountryDto.viName,
      createCountryDto.enName,
      createCountryDto.code,
    );

    if (existing) {
      throw new ConflictException(
        `Đã tồn tại quốc gia với mã ${createCountryDto.code} hoặc tên ${createCountryDto.viName} | ${createCountryDto.enName}`,
      );
    }

    const country = await this.repo.create(createCountryDto);
    this.logger.log(`Country created: ${country.id}`);
    await this.cache.incr(CacheKeys.country.listVersion());
    return country;
  }

  async findAll(paginationDto: PaginationDto) {
    const { page = 1, limit = 10, keyword } = paginationDto;
    const version = await this.cache.getCounter(
      CacheKeys.country.listVersion(),
    );

    return this.cache.getOrLoad({
      key: CacheKeys.country.list(version, page, limit, keyword),
      schema: CountryListCacheSchema,
      ttlSeconds: CacheTtl.lookup,
      loader: async () => {
        const countries = await this.repo.findAll(paginationDto);
        this.logger.log(`Found ${countries.data.length} countries`);
        return countries;
      },
    });
  }

  async findOne(id: number) {
    this.logger.log(`Finding country with ID ${id}`);
    const country = await this.repo.findById(id);
    if (!country) {
      throw new NotFoundException(`Country with ID ${id} not found`);
    }
    return country;
  }

  async update(id: number, updateCountryDto: UpdateCountryDto) {
    this.logger.log(`Updating country with ID ${id}`);
    const country = await this.findOne(id); // Check exists
    const updated = await this.repo.update(country.id, updateCountryDto);
    await this.cache.incr(CacheKeys.country.listVersion());
    this.logger.log(`Country with ID ${id} updated`);
    return updated;
  }

  async remove(id: number) {
    this.logger.log(`Removing country with ID ${id}`);
    if (id <= 0) {
      throw new NotFoundException(`Id không hợp lệ`);
    }
    const hasRemoved = await this.repo.remove(id);
    if (!hasRemoved) {
      this.logger.warn(`Country with ID ${id} not found for removal`);
      return { success: false };
    }
    await this.cache.incr(CacheKeys.country.listVersion());
    this.logger.log(`Country with ID ${id} removed`);
    return { success: true };
  }
}
