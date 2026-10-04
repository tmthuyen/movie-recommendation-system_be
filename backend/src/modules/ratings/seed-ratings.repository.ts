import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SeedRating } from './entities/seed-rating.entity';

export const ISeedRatingRepository = Symbol('ISeedRatingRepository');

export interface ISeedRatingRepository {
  findBatch(limit: number, offset: number): Promise<SeedRating[]>;
  count(): Promise<number>;
}

@Injectable()
export class SeedRatingRepository implements ISeedRatingRepository {
  constructor(
    @InjectRepository(SeedRating)
    private readonly repo: Repository<SeedRating>,
  ) {}

  async findBatch(limit: number, offset: number): Promise<SeedRating[]> {
    return this.repo.find({
      take: limit,
      skip: offset,
      order: { id: 'ASC' },
    });
  }

  async count(): Promise<number> {
    return this.repo.count();
  }
}
