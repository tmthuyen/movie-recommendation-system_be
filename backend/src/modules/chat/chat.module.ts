import { Module } from '@nestjs/common';
import { MoviesModule } from '@/modules/movies/movies.module';
import { ChatController } from './chat.controller';
import { ChatService, IChatService } from './chat.service';

@Module({
  imports: [MoviesModule],
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
