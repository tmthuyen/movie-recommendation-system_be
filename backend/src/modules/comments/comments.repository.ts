import { BaseSearchRequest } from '@/common/dtos/base-search-query.dto';
import { SearchUtils } from '@/common/utils/search.util';
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Comment } from './entities/comment.entity';

export const ICommentRepository = Symbol('ICommentRepository');

export interface ICommentRepository {
  findAll(request: BaseSearchRequest): Promise<[Comment[], number]>;
  findByMovie(
    movieId: number,
    request: BaseSearchRequest,
    parentId?: number,
  ): Promise<[Comment[], number]>;
  findById(id: number): Promise<Comment | null>;
  create(comment: Partial<Comment>): Promise<Comment>;
  update(id: number, comment: Partial<Comment>): Promise<Comment | null>;
  remove(id: number): Promise<boolean>;
}

@Injectable()
export class CommentRepository implements ICommentRepository {
  constructor(
    @InjectRepository(Comment)
    private readonly repo: Repository<Comment>,
  ) {}

  private applySearch(
    qb: SelectQueryBuilder<Comment>,
    request: BaseSearchRequest,
  ): void {
    const { keyword, filters = [], sort = ['createdAt:DESC'] } = request;

    // keyword search: content, user, movie
    const trimmedKeyword = keyword?.trim();
    if (trimmedKeyword) {
      qb.andWhere(
        '(comment.content ILIKE :keyword OR user.fullName ILIKE :keyword OR user.email ILIKE :keyword OR movie.title ILIKE :keyword OR movie.titleVi ILIKE :keyword)',
        { keyword: `%${trimmedKeyword}%` },
      );
    }

    // ====================
    // START FILTER <= >=
    // ====================

    const fieldMap: Record<string, string> = {
      id: 'comment.id',
      content: 'comment.content',
      parentId: 'comment.parentId',
      createdAt: 'comment.createdAt',
      updatedAt: 'comment.updatedAt',
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
      id: 'comment.id',
      content: 'comment.content',
      createdAt: 'comment.createdAt',
      updatedAt: 'comment.updatedAt',
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
      qb.addOrderBy('comment.id', 'ASC');
    }

    // ====================
    // END SORT
    // ====================
  }

  async findAll(request: BaseSearchRequest): Promise<[Comment[], number]> {
    const { page = 1, limit = 10 } = request;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('comment')
      .leftJoin('comment.user', 'user')
      .leftJoin('comment.movie', 'movie')
      .select([
        'comment',
        'user.id',
        'user.fullName',
        'user.email',
        'user.avatarUrl',
        'movie.id',
        'movie.title',
      ]);

    this.applySearch(queryBuilder, request);

    queryBuilder.skip(skip).take(limit);

    return queryBuilder.getManyAndCount();
  }

  async findByMovie(
    movieId: number,
    request: BaseSearchRequest,
    parentId?: number,
  ): Promise<[Comment[], number]> {
    const { page = 1, limit = 10 } = request;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('comment')
      .leftJoin('comment.user', 'user')
      .leftJoin('comment.movie', 'movie')
      .select(['comment', 'user.id', 'user.fullName', 'user.avatarUrl'])
      .where('comment.movie.id = :movieId', { movieId });

    if (parentId) {
      queryBuilder.andWhere('comment.parentId = :parentId', { parentId });
    } else {
      queryBuilder.andWhere('comment.parentId IS NULL');
    }

    this.applySearch(queryBuilder, request);

    // Let's just use a subquery to count replies
    queryBuilder.addSelect(subQuery => {
      return subQuery
        .select('COUNT(c.id)', 'count')
        .from(Comment, 'c')
        .where('c.parentId = comment.id');
    }, 'replyCount');

    queryBuilder.skip(skip).take(limit);

    const { entities, raw } = await queryBuilder.getRawAndEntities();

    // Map the raw replyCount back to the entities
    entities.forEach((entity, index) => {
      (entity as any).replyCount = parseInt(raw[index].replyCount || '0', 10);
    });

    const total = await queryBuilder.getCount();

    return [entities, total];
  }

  async findById(id: number): Promise<Comment | null> {
    return this.repo
      .createQueryBuilder('comment')
      .leftJoin('comment.user', 'user')
      .leftJoin('comment.movie', 'movie')
      .select([
        'comment',
        'user.id',
        'user.fullName',
        'user.avatarUrl',
        'movie.id',
        'movie.title',
      ])
      .where('comment.id = :id', { id })
      .getOne();
  }

  async create(comment: Partial<Comment>): Promise<Comment> {
    const newComment = this.repo.create(comment);
    return await this.repo.save(newComment);
  }

  async update(id: number, comment: Partial<Comment>): Promise<Comment | null> {
    await this.repo.update(id, comment);
    return this.findById(id);
  }

  async remove(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return Boolean(result.affected && result.affected > 0);
  }
}
