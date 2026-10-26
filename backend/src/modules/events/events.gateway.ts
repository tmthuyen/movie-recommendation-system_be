import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Comment } from '@/modules/comments/entities/comment.entity';
import { Rating } from '@/modules/ratings/entities/rating.entity';

/** Payload realtime khi like/comment/rating/click thay đổi ở trang chi tiết phim. */
export interface InteractionBroadcastPayload {
  movieId: number;
  type: string;
  action: 'added' | 'removed' | 'updated';
  score: number;
  likeCount: number;
  commentCount: number;
  viewCount: number;
}

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  broadcastComment(movieId: number, comment: Comment) {
    this.server.emit(`movie-${movieId}-comment`, comment);
  }

  broadcastRating(movieId: number, rating: any) {
    this.server.emit(`movie-${movieId}-rating`, rating);
  }

  broadcastViewCount(movieId: number, viewCount: number) {
    this.server.emit(`movie-${movieId}-viewCount`, { movieId, viewCount });
  }

  /** Realtime số liệu tương tác (like/comment/rating/click) của phim. */
  broadcastInteraction(payload: InteractionBroadcastPayload) {
    this.server.emit(`movie-${payload.movieId}-interaction`, payload);
  }

  @SubscribeMessage('typingComment')
  handleTypingComment(
    @MessageBody()
    data: { movieId: number; isTyping: boolean; userFullName?: string },
    @ConnectedSocket() client: Socket,
  ) {
    // Broadcast to everyone else that a user is typing
    client.broadcast.emit(`movie-${data.movieId}-typing`, {
      isTyping: data.isTyping,
      userFullName: data.userFullName || 'Một người dùng',
    });
  }
}
