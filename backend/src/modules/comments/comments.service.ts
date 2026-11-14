import {
  Injectable,
  Inject,
  NotFoundException,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ICommentRepository } from './comments.repository';
import { QueryCommentDto } from './dto/query-comment.dto';
import { DataSource } from 'typeorm';
import {
  Interaction,
  InteractionScoreMap,
  InteractionType,
} from '@/modules/interactions/entities/interaction.entity';
import { Comment } from './entities/comment.entity';
import { EventsGateway } from '@/modules/events/events.gateway';
import { User } from '../users/entities/user.entity';
import { Movie } from '../movies/entities/movie.entity';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { MovieInteractionStatsService } from '../interactions/movie-interaction-stats.service';
import { ResultWithPagination } from '@/common/dtos/paginated-result.interface';
import { PaginationUtils } from '@/common/utils/search.util';

@Injectable()
export class CommentsService {
  private readonly logger = new Logger(CommentsService.name);
  constructor(
    @Inject(ICommentRepository)
    private readonly repo: ICommentRepository,
    private readonly dataSource: DataSource,
    private readonly eventsGateway: EventsGateway,
    private readonly interactionProducer: InteractionProducer,
    private readonly statsService: MovieInteractionStatsService,
  ) {}

  async create(
    userId: string,
    createCommentDto: CreateCommentDto,
  ): Promise<Comment> {
    const { movieId, content, parentId } = createCommentDto;

    // check movieId exists

    // check userId exists

    const savedComment = await this.dataSource.transaction(async manager => {
      // Create Comment
      const newComment = manager.create(Comment, {
        content,
        parentId,
        movie: { id: movieId } as Movie,
        user: { id: userId } as User,
      });
      const comment = await manager.save(newComment);

      // Create Interaction
      const interaction = manager.create(Interaction, {
        score: 0,
        type: InteractionType.COMMENT,
        movie: { id: movieId } as Movie,
        user: { id: userId } as User,
      });
      await manager.save(interaction);

      return comment;
    });

    // Chỉ broadcast/publish SAU khi transaction commit.
    const stats = await this.statsService.getStats(movieId);

    this.eventsGateway.broadcastComment(movieId, savedComment);
    this.eventsGateway.broadcastInteraction({
      movieId,
      type: InteractionType.COMMENT,
      action: 'added',
      score: 0,
      likeCount: stats.likeCount,
      commentCount: stats.commentCount,
      viewCount: stats.viewCount,
    });

    await this.interactionProducer.publishInteractionCreated({
      userId,
      movieId,
      action: InteractionType.COMMENT,
      score: null,
      removed: false,
      createdAt: savedComment.createdAt ?? new Date(),
    });

    return savedComment;
  }

  async findAll(
    request: QueryCommentDto,
  ): Promise<ResultWithPagination<Comment>> {
    const page = Math.max(request.page ?? 1, 1);
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);

    const [data, total] = await this.repo.findAll({
      ...request,
      page,
      limit,
    });

    this.logger.log('Số lượng bình luận được tìm thấy:', data.length);

    return {
      result: data,
      pagination: PaginationUtils.getPaginationMeta(page, limit, total),
    };
  }

  async findByMovie(
    movieId: number,
    request: QueryCommentDto,
    parentId?: number,
  ): Promise<ResultWithPagination<Comment>> {
    const page = Math.max(request.page ?? 1, 1);
    const limit = Math.min(Math.max(request.limit ?? 10, 1), 100);

    const [data, total] = await this.repo.findByMovie(
      movieId,
      { ...request, page, limit },
      parentId,
    );

    this.logger.log(
      `Số lượng bình luận được tìm thấy cho movieId=${movieId}: ${data.length}`,
    );

    return {
      result: data,
      pagination: PaginationUtils.getPaginationMeta(page, limit, total),
    };
  }

  async findOne(id: number) {
    const comment = await this.repo.findById(id);
    if (!comment) {
      throw new NotFoundException(`Comment with ID ${id} not found`);
    }
    return comment;
  }

  async update(id: number, userId: string, updateCommentDto: UpdateCommentDto) {
    if (!updateCommentDto.content || updateCommentDto.content === undefined) {
      throw new BadRequestException('Nội dung bình luận không được để trống');
    }
    const comment = await this.findOne(id);
    if (comment.user.id !== userId) {
      throw new ForbiddenException('Không có quyền cập nhật bình luận này');
    }
    return this.repo.update(comment.id, { content: updateCommentDto.content });
  }

  async remove(id: number) {
    const comment = await this.findOne(id);
    await this.repo.remove(comment.id);
    return { success: true };
  }
}
