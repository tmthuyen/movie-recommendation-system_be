import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { Comment } from './entities/comment.entity';
import { CommentRepository, ICommentRepository } from './comments.repository';
import { EventsModule } from '../events/events.module';

@Module({
  imports: [TypeOrmModule.forFeature([Comment]), EventsModule],
  controllers: [CommentsController],
  providers: [
    {
      provide: ICommentRepository,
      useClass: CommentRepository,
    },
    CommentsService,
  ],
  exports: [CommentsService],
})
export class CommentsModule {}
