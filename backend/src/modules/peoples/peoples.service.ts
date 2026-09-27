import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreatePeopleDto } from './dto/create-people.dto';
import { UpdatePeopleDto } from './dto/update-people.dto';
import { IPeopleRepository } from './peoples.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';

@Injectable()
export class PeoplesService {
  constructor(
    @Inject(IPeopleRepository)
    private readonly repo: IPeopleRepository,
  ) {}

  async create(createPeopleDto: CreatePeopleDto) {
    return this.repo.create(createPeopleDto);
  }

  async findAll(paginationDto: PaginationDto) {
    return this.repo.findAll(paginationDto);
  }

  async findOne(id: number) {
    const people = await this.repo.findById(id);
    if (!people) {
      throw new NotFoundException(`People with ID ${id} not found`);
    }
    return people;
  }

  async update(id: number, updatePeopleDto: UpdatePeopleDto) {
    const people = await this.findOne(id); // Check exists
    return this.repo.update(people.id, updatePeopleDto);
  }

  async remove(id: number) {
    const people = await this.findOne(id); // Check exists
    await this.repo.remove(people.id);
    return { success: true };
  }
}
