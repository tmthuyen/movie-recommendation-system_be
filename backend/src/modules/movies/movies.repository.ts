import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Movie } from './entities/movie.entity';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';

export const IMovieRepository = Symbol('IMovieRepository');

export interface IMovieRepository {
  findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Movie>>;
  findById(id: number): Promise<Movie | null>;
  create(movie: Partial<Movie>): Promise<Movie>;
  update(id: number, movie: Partial<Movie>): Promise<Movie | null>;
  remove(id: number): Promise<boolean>;
}

@Injectable()
export class MovieRepository implements IMovieRepository {
  constructor(
    @InjectRepository(Movie)
    private readonly repo: Repository<Movie>,
  ) {}

  async findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Movie>> {
    const { page = 1, limit = 10, keyword } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('movie')
      .leftJoinAndSelect('movie.genres', 'genre')
      .leftJoinAndSelect('movie.country', 'country')
      .leftJoinAndSelect('movie.moviePeoples', 'moviePeople')
      .leftJoinAndSelect('moviePeople.people', 'people');

    if (keyword) {
      queryBuilder.where(
        'movie.title ILIKE :keyword OR movie.titleVi ILIKE :keyword',
        { keyword: `%${keyword}%` },
      );
    }

    queryBuilder.skip(skip).take(limit).orderBy('movie.createdAt', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number): Promise<Movie | null> {
    return this.repo
      .createQueryBuilder('movie')
      .leftJoinAndSelect('movie.genres', 'genre')
      .leftJoinAndSelect('movie.country', 'country')
      .leftJoinAndSelect('movie.moviePeoples', 'moviePeople')
      .leftJoinAndSelect('moviePeople.people', 'people')
      .where('movie.id = :id', { id })
      .getOne();
  }

  async create(movie: Partial<Movie>): Promise<Movie> {
    const newMovie = this.repo.create(movie);
    return this.repo.save(newMovie);
  }

  async update(id: number, movie: Partial<Movie>): Promise<Movie | null> {
    await this.repo.update(id, movie);
    return this.findById(id);
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return Boolean(result.affected && result.affected > 0);
  }
}
