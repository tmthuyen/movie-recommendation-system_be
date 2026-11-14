import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { SearchUtils } from '@/common/utils/search.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Interaction } from './entities/interaction.entity';
import { User } from '@/modules/users/entities/user.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';

export const IInteractionRepository = Symbol('IInteractionRepository');

export interface IInteractionRepository {
  findAll(request: BaseSearchRequest): Promise<[Interaction[], number]>;
  findByUser(
    userId: string,
    request: BaseSearchRequest,
    types?: string[],
  ): Promise<[Interaction[], number]>;
  findById(id: number): Promise<Interaction | null>;
  create(interaction: Partial<Interaction>): Promise<Interaction>;
  update(
    id: number,
    interaction: Partial<Interaction>,
  ): Promise<Interaction | null>;
  remove(id: number): Promise<boolean>;
  findByUnique(
    userId: string,
    movieId: number,
    type: string,
  ): Promise<Interaction | null>;
  countByMovieAndType(movieId: number, type?: string): Promise<number>;
  findAllByUserAndMovie(
    userId: string,
    movieId: number,
  ): Promise<Interaction[]>;
  findLatestByCreatedAtAndId(
    lastCreatedAt: string | null,
    lastId: number | null,
    limit: number,
  ): Promise<{
    data: Interaction[];
    nextCursor: { lastCreatedAt: string; lastId: number } | null;
  }>;
}

@Injectable()
export class InteractionRepository implements IInteractionRepository {
  constructor(
    @InjectRepository(Interaction)
    private readonly repo: Repository<Interaction>,
  ) {}

  private applySearch(
    qb: SelectQueryBuilder<Interaction>,
    request: BaseSearchRequest,
  ): void {
    const { keyword, filters = [], sort = ['createdAt:DESC'] } = request;

    // keyword search: user, movie, type
    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      qb.andWhere(
        '(user.fullName ILIKE :keyword OR user.email ILIKE :keyword OR movie.title ILIKE :keyword OR movie.titleVi ILIKE :keyword OR interaction.type ILIKE :keyword)',
        { keyword: `%${trimmedKeyword}%` },
      );
    }

    // ====================
    // START FILTER <= >=
    // ====================

    const fieldMap: Record<string, string> = {
      id: 'interaction.id',
      score: 'interaction.score',
      type: 'interaction.type',
      createdAt: 'interaction.createdAt',
      updatedAt: 'interaction.updatedAt',
      userId: 'user.id',
      userEmail: 'user.email',
      userFullName: 'user.fullName',
      movieId: 'movie.id',
      movieTitle: 'movie.title',
    };

    SearchUtils.applyFilters(qb, filters || [], fieldMap);

    // ====================
    // END FILTER <= >=
    // ====================

    // ====================
    // START SORT
    // ====================

    const sortMap = {
      id: 'interaction.id',
      score: 'interaction.score',
      type: 'interaction.type',
      createdAt: 'interaction.createdAt',
      updatedAt: 'interaction.updatedAt',
    };

    const sortOptions = SearchUtils.parseSort(
      sort.join(','),
      Object.keys(sortMap),
    );

    for (const option of sortOptions) {
      const column = sortMap[option.field] as string | undefined;
      if (!column) {
        throw new BadRequestException(
          `Sort field không hợp lệ: ${option.field}`,
        );
      }
      qb.addOrderBy(column, option.direction);
    }

    // stable sort by id
    if (!sortOptions.some(option => option.field === 'id')) {
      qb.addOrderBy('interaction.id', 'ASC');
    }

    // ====================
    // END SORT
    // ====================
  }

  async findAll(request: BaseSearchRequest): Promise<[Interaction[], number]> {
    const { page = 1, limit = 10 } = request;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('interaction')
      .leftJoinAndSelect('interaction.user', 'user')
      .leftJoinAndSelect('interaction.movie', 'movie');

    this.applySearch(queryBuilder, request);

    queryBuilder.skip(skip).take(limit);

    return queryBuilder.getManyAndCount();
  }

  async findByUser(
    userId: string,
    request: BaseSearchRequest,
    types?: string[],
  ): Promise<[Interaction[], number]> {
    const { page = 1, limit = 10 } = request;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('interaction')
      .leftJoin('interaction.user', 'user')
      .leftJoinAndSelect('interaction.movie', 'movie')
      .where('interaction.user_id = :userId', { userId });

    if (types && types.length > 0) {
      queryBuilder.andWhere('interaction.type IN (:...types)', { types });
    }

    this.applySearch(queryBuilder, request);

    queryBuilder.skip(skip).take(limit);

    return queryBuilder.getManyAndCount();
  }

  async findById(id: number): Promise<Interaction | null> {
    return this.repo
      .createQueryBuilder('interaction')
      .leftJoinAndSelect('interaction.user', 'user')
      .leftJoinAndSelect('interaction.movie', 'movie')
      .where('interaction.id = :id', { id })
      .getOne();
  }

  async create(interaction: Partial<Interaction>): Promise<Interaction> {
    const newInteraction = this.repo.create(interaction);
    return this.repo.save(newInteraction);
  }

  async update(
    id: number,
    interaction: Partial<Interaction>,
  ): Promise<Interaction | null> {
    await this.repo.update(id, interaction);
    return this.findById(id);
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return Boolean(result.affected && result.affected > 0);
  }

  async findByUnique(
    userId: string,
    movieId: number,
    type: string,
  ): Promise<Interaction | null> {
    return this.repo.findOne({
      where: {
        user: { id: userId } as any,
        movie: { id: movieId } as any,
        type: type as any,
      },
    });
  }

  async countByMovieAndType(movieId: number, type?: string): Promise<number> {
    return this.repo.count({
      where: {
        movie: { id: movieId } as any,
        ...(type ? { type: type as any } : {}),
      },
    });
  }

  async findAllByUserAndMovie(
    userId: string,
    movieId: number,
  ): Promise<Interaction[]> {
    return this.repo.find({
      where: {
        user: { id: userId } as User,
        movie: { id: movieId } as Movie,
      },
      order: {
        id: 'DESC',
      },
    });
  }

  async findLatestByCreatedAtAndId(
    lastCreatedAt: string | null,
    lastId: Interaction['id'] | null,
    limit: number,
  ): Promise<{
    data: Interaction[];
    nextCursor: { lastCreatedAt: string; lastId: number } | null;
  }> {
    const queryBuilder = this.repo
      .createQueryBuilder('interaction')
      .leftJoin('interaction.user', 'user')
      .leftJoin('interaction.movie', 'movie')
      .addSelect(['user.id'])
      .addSelect(['movie.id'])

      // Lấy createdAt nguyên bản từ PostgreSQL dưới dạng string
      .addSelect('CAST(interaction.createdAt AS text)', 'cursorCreatedAt')

      .orderBy('interaction.createdAt', 'ASC')
      .addOrderBy('interaction.id', 'ASC')
      .take(limit);

    if (lastCreatedAt !== null && lastId !== null) {
      queryBuilder.where(
        '(interaction.createdAt, interaction.id) > (:lastCreatedAt, :lastId)',
        {
          lastCreatedAt,
          lastId,
        },
      );
    }

    const { entities, raw } = await queryBuilder.getRawAndEntities();

    if (entities.length === 0) {
      return {
        data: [],
        nextCursor: null,
      };
    }

    const lastIndex = entities.length - 1;

    return {
      data: entities,
      nextCursor: {
        lastCreatedAt: raw[lastIndex].cursorCreatedAt,
        lastId: entities[lastIndex].id,
      },
    };
  }
}
