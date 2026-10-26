import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentsService } from './comments.service';
import { CommentsController } from './comments.controller';
import { Comment } from './entities/comment.entity';
import { CommentRepository, ICommentRepository } from './comments.repository';
import { EventsModule } from '../events/events.module';
import { InteractionStatsModule } from '../interactions/interaction-stats.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment]),
    forwardRef(() => EventsModule),
    InteractionStatsModule,
  ],
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
