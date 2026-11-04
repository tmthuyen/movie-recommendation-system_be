import { Server, Socket } from 'socket.io';

import { EventsGateway } from './events.gateway';
import { Comment } from '@/modules/comments/entities/comment.entity';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let server: { emit: jest.Mock };
  let consoleLog: jest.SpyInstance;

  beforeEach(() => {
    gateway = new EventsGateway();
    server = { emit: jest.fn() };
    gateway.server = server as unknown as Server;
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('broadcast tới server', () => {
    it('broadcastComment phát đúng event name và payload comment', () => {
      const comment = {
        id: 1,
        content: 'Hay quá',
        movie: { id: 3 },
      } as unknown as Comment;

      gateway.broadcastComment(3, comment);

      expect(server.emit).toHaveBeenCalledTimes(1);
      expect(server.emit).toHaveBeenCalledWith('movie-3-comment', comment);
    });

    it('broadcastRating phát đúng event name và payload rating', () => {
      const rating = { id: 5, rating: 4, movieStats: { voteCount: 2 } };

      gateway.broadcastRating(7, rating);

      expect(server.emit).toHaveBeenCalledWith('movie-7-rating', rating);
    });

    it('broadcastViewCount phát { movieId, viewCount } tới event viewCount', () => {
      gateway.broadcastViewCount(9, 1234);

      expect(server.emit).toHaveBeenCalledWith('movie-9-viewCount', {
        movieId: 9,
        viewCount: 1234,
      });
    });

    it('broadcastInteraction phát nguyên payload tới event interaction', () => {
      const payload = {
        movieId: 12,
        type: 'like',
        action: 'added' as const,
        score: 1,
        likeCount: 10,
        commentCount: 4,
        viewCount: 999,
      };

      gateway.broadcastInteraction(payload);

      expect(server.emit).toHaveBeenCalledWith('movie-12-interaction', payload);
    });

    it('mỗi broadcast chỉ phát 1 event (không phát lẫn event khác)', () => {
      gateway.broadcastViewCount(1, 5);

      expect(server.emit.mock.calls.map(call => call[0])).toEqual([
        'movie-1-viewCount',
      ]);
    });
  });

  describe('handleTypingComment', () => {
    it('broadcast tới các client khác (không gửi lại cho chính client)', () => {
      const client = {
        broadcast: { emit: jest.fn() },
      } as unknown as Socket;

      gateway.handleTypingComment(
        { movieId: 4, isTyping: true, userFullName: 'Nguyễn Văn A' },
        client,
      );

      expect((client.broadcast.emit as jest.Mock).mock.calls).toEqual([
        ['movie-4-typing', { isTyping: true, userFullName: 'Nguyễn Văn A' }],
      ]);
      expect(server.emit).not.toHaveBeenCalled();
    });

    it('thiếu userFullName → dùng nhãn mặc định và giữ isTyping=false', () => {
      const client = {
        broadcast: { emit: jest.fn() },
      } as unknown as Socket;

      gateway.handleTypingComment({ movieId: 5, isTyping: false }, client);

      expect((client.broadcast.emit as jest.Mock).mock.calls).toEqual([
        ['movie-5-typing', { isTyping: false, userFullName: 'Một người dùng' }],
      ]);
    });
  });

  describe('connection lifecycle', () => {
    it('handleConnection log client id', () => {
      gateway.handleConnection({ id: 'socket-1' } as unknown as Socket);

      expect(consoleLog).toHaveBeenCalledWith('Client connected: socket-1');
    });

    it('handleDisconnect log client id', () => {
      gateway.handleDisconnect({ id: 'socket-2' } as unknown as Socket);

      expect(consoleLog).toHaveBeenCalledWith('Client disconnected: socket-2');
    });
  });
});
