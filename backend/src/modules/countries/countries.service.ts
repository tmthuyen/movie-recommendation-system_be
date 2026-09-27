import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { ICountryRepository } from './countries.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';

@Injectable()
export class CountriesService {
  constructor(
    @Inject(ICountryRepository)
    private readonly repo: ICountryRepository,
  ) {}

  async create(createCountryDto: CreateCountryDto) {
    return this.repo.create(createCountryDto);
  }

  async findAll(paginationDto: PaginationDto) {
    return this.repo.findAll(paginationDto);
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
