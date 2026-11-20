import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from '@/modules/comments/entities/comment.entity';
import { Movie } from '@/modules/movies/entities/movie.entity';
import { MoviesModule } from '@/modules/movies/movies.module';
import { ChatController } from './chat.controller';
import { ChatService, IChatService } from './chat.service';

@Module({
  imports: [MoviesModule, TypeOrmModule.forFeature([Movie, Comment])],
  controllers: [ChatController],
  providers: [
    {
      provide: IChatService,
      useClass: ChatService,
    },
  ],
  exports: [IChatService],
})
export class ChatModule {}
