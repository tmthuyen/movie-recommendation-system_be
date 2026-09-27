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
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';

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

  broadcastComment(movieId: number, comment: any) {
    this.server.emit(`movie-${movieId}-comment`, comment);
  }

  broadcastRating(movieId: number, rating: any) {
    this.server.emit(`movie-${movieId}-rating`, rating);
  }

  broadcastViewCount(movieId: number, viewCount: number) {
    this.server.emit(`movie-${movieId}-viewCount`, { movieId, viewCount });
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
