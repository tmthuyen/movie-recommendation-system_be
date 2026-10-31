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

@Injectable()
export class CountriesService {
  private readonly logger = new Logger(CountriesService.name);

  constructor(
    @Inject(ICountryRepository)
    private readonly repo: ICountryRepository,
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
    return country;
  }

  async findAll(paginationDto: PaginationDto) {
    const countries = await this.repo.findAll(paginationDto);
    this.logger.log(`Found ${countries.data.length} countries`);
    return countries;
  }

  async findOne(id: number) {
    const country = await this.repo.findById(id);
    if (!country) {
      throw new NotFoundException(`Country with ID ${id} not found`);
    }
    return country;
  }

  async update(id: number, updateCountryDto: UpdateCountryDto) {
    const country = await this.findOne(id); // Check exists
    return this.repo.update(country.id, updateCountryDto);
  }

  async remove(id: number) {
    const country = await this.findOne(id); // Check exists
    await this.repo.remove(country.id);
    return { success: true };
  }
}
