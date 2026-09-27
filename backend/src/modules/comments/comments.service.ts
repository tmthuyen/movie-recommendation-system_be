import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { ICommentRepository } from './comments.repository';
import { PaginationDto } from '@/common/dtos/pagination.dto';
import { DataSource } from 'typeorm';
import {
  Interaction,
  InteractionType,
} from '@/modules/interactions/entities/interaction.entity';
import { Comment } from './entities/comment.entity';
import { EventsGateway } from '@/modules/events/events.gateway';

@Injectable()
export class CommentsService {
  constructor(
    @Inject(ICommentRepository)
    private readonly repo: ICommentRepository,
    private readonly dataSource: DataSource,
    private readonly eventsGateway: EventsGateway,
  ) {}

  async create(userId: string, createCommentDto: CreateCommentDto) {
    const { movieId, content, parentId } = createCommentDto;

    return await this.dataSource.transaction(async manager => {
      // Create Comment
      const newComment = manager.create(Comment, {
        content,
        parentId,
        movie: { id: movieId } as any,
        user: { id: userId } as any,
      });
      const savedComment = await manager.save(newComment);

      // Create Interaction
      const interaction = manager.create(Interaction, {
        score: 1, // Default score for comment interaction
        type: InteractionType.COMMENT,
        movie: { id: movieId } as any,
        user: { id: userId } as any,
      });
      await manager.save(interaction);

      this.eventsGateway.broadcastComment(movieId, savedComment);

      return savedComment;
    });
  }

  async findAll(paginationDto: PaginationDto) {
    return this.repo.findAll(paginationDto);
  }

  async findByMovie(movieId: number, paginationDto: PaginationDto) {
    return this.repo.findByMovie(movieId, paginationDto);
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
