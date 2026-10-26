import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ICommentRepository } from './comments.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
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
import { PaginatedResult } from '@/common/dtos/api-response.dto';
import { InteractionProducer } from '@/infrastructure/messaging/producers/interaction.producer';
import { MovieInteractionStatsService } from '../interactions/movie-interaction-stats.service';

@Injectable()
export class CommentsService {
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
    const score = InteractionScoreMap[InteractionType.COMMENT];

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
        score,
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
      score,
      likeCount: stats.likeCount,
      commentCount: stats.commentCount,
      viewCount: stats.viewCount,
    });

    this.interactionProducer.publishInteractionCreated({
      userId,
      movieId,
      action: InteractionType.COMMENT,
      score,
      removed: false,
      createdAt: savedComment.createdAt ?? new Date(),
    });

    return savedComment;
  }

  async findAll(
    paginationDto: PaginationDto,
  ): Promise<PaginatedResult<Comment>> {
    return this.repo.findAll(paginationDto);
  }

  async findByMovie(
    movieId: number,
    paginationDto: PaginationDto,
    parentId?: number,
  ) {
    return this.repo.findByMovie(movieId, paginationDto, parentId);
  }

  async findOne(id: number) {
    const comment = await this.repo.findById(id);
    if (!comment) {
      throw new NotFoundException(`Comment with ID ${id} not found`);
    }
    return comment;
  }

  async update(id: number, updateCommentDto: UpdateCommentDto) {
    const comment = await this.findOne(id);
    return this.repo.update(comment.id, updateCommentDto);
  }

  async remove(id: number) {
    const comment = await this.findOne(id);
    await this.repo.remove(comment.id);
    return { success: true };
  }
}
