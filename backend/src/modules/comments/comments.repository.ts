import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './entities/comment.entity';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { PaginatedResult } from '@/common/dtos/paginated-result.interface';

export const ICommentRepository = Symbol('ICommentRepository');

export interface ICommentRepository {
  findAll(paginationDto: PaginationDto): Promise<PaginatedResult<Comment>>;
  findByMovie(
    movieId: number,
    paginationDto: PaginationDto,
    parentId?: number,
  ): Promise<PaginatedResult<Comment>>;
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

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Comment>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .leftJoinAndSelect('comment.movie', 'movie')
      .skip(skip)
      .take(limit)
      .orderBy('comment.createdAt', 'DESC');

    const [data, total] = await queryBuilder.getManyAndCount();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByMovie(
    movieId: number,
    paginationDto: PaginationDto,
    parentId?: number,
  ): Promise<PaginatedResult<Comment>> {
    const { page = 1, limit = 10 } = paginationDto;
    const skip = (page - 1) * limit;

    const queryBuilder = this.repo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .where('comment.movie_id = :movieId', { movieId })
      .skip(skip)
      .take(limit)
      .orderBy('comment.createdAt', 'DESC');

    if (parentId) {
      queryBuilder.andWhere('comment.parentId = :parentId', { parentId });
    } else {
      queryBuilder.andWhere('comment.parentId IS NULL');
    }

    // Let's just use a subquery to count replies
    queryBuilder.addSelect(subQuery => {
      return subQuery
        .select('COUNT(c.id)', 'count')
        .from(Comment, 'c')
        .where('c.parentId = comment.id');
    }, 'replyCount');

    const { entities, raw } = await queryBuilder.getRawAndEntities();

    // Map the raw replyCount back to the entities
    entities.forEach((entity, index) => {
      (entity as any).replyCount = parseInt(raw[index].replyCount || '0', 10);
    });

    const total = await queryBuilder.getCount();

    return {
      data: entities,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: number): Promise<Comment | null> {
    return this.repo
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .leftJoinAndSelect('comment.movie', 'movie')
      .where('comment.id = :id', { id })
      .getOne();
  }

  async create(comment: Partial<Comment>): Promise<Comment> {
    const newComment = this.repo.create(comment);
    return this.repo.save(newComment);
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
