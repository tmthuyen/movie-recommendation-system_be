import { RedisService } from '@/infrastructure/redis/redis.service';
import { SessionData, SessionService } from './session.service';

const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

describe('SessionService', () => {
  let service: SessionService;
  let redis: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    sadd: jest.Mock;
    srem: jest.Mock;
    smembers: jest.Mock;
  };
  let loggerLog: jest.SpyInstance;
  let loggerWarn: jest.SpyInstance;

  const makeSession = (overrides: Partial<SessionData> = {}): SessionData => ({
    userId: 'user-1',
    refreshToken: 'sess-1.opaque-token',
    deviceId: 'device-1',
    ip: '127.0.0.1',
    userAgent: 'jest-agent',
    createdAt: 1_700_000_000_000,
    expiresAt: 1_700_000_000_000 + SESSION_TTL_SECONDS * 1000,
    lastActivityAt: 1_700_000_000_000,
    sessionId: 'sess-1',
    jti: 'jti-1',
    ...overrides,
  });

  beforeEach(() => {
    redis = {
      set: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(undefined),
      sadd: jest.fn().mockResolvedValue(undefined),
      srem: jest.fn().mockResolvedValue(undefined),
      smembers: jest.fn().mockResolvedValue([]),
    };

    service = new SessionService(redis as unknown as RedisService);

    loggerLog = jest
      .spyOn(service['logger'], 'log')
      .mockImplementation(() => undefined);
    loggerWarn = jest
      .spyOn(service['logger'], 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('createSession', () => {
    it('lưu session JSON vào auth:session:<id> với TTL 30 ngày', async () => {
      const before = Date.now();

      const session = await service.createSession(
        'user-1',
        '127.0.0.1',
        'jest-agent',
        'device-1',
        'sess-1',
        'jti-1',
      );

      expect(redis.set).toHaveBeenCalledTimes(1);
      const [key, rawValue, ttl] = redis.set.mock.calls[0] as [
        string,
        string,
        number,
      ];
      expect(key).toBe('auth:session:sess-1');
      expect(ttl).toBe(SESSION_TTL_SECONDS);

      const stored = JSON.parse(rawValue) as SessionData;
      expect(stored).toMatchObject({
        userId: 'user-1',
        ip: '127.0.0.1',
        userAgent: 'jest-agent',
        deviceId: 'device-1',
        sessionId: 'sess-1',
        jti: 'jti-1',
        refreshToken: session.refreshToken,
      });
      expect(stored.expiresAt - stored.createdAt).toBe(
        SESSION_TTL_SECONDS * 1000,
      );
      expect(stored.lastActivityAt).toBe(stored.createdAt);
      expect(stored.createdAt).toBeGreaterThanOrEqual(before);
    });

    it('thêm sessionId vào set auth:user:<id>:sessions cùng TTL', async () => {
      await service.createSession(
        'user-1',
        '127.0.0.1',
        'UA',
        'device-1',
        'sess-1',
        'jti-1',
      );

      expect(redis.sadd).toHaveBeenCalledWith(
        'auth:user:user-1:sessions',
        'sess-1',
        SESSION_TTL_SECONDS,
      );
    });

    it('refresh token có dạng "<sessionId>.<80 hex>" và khác nhau mỗi lần', async () => {
      const first = await service.createSession(
        'user-1',
        'ip',
        'UA',
        'device-1',
        'sess-1',
        'jti-1',
      );
      const second = await service.createSession(
        'user-1',
        'ip',
        'UA',
        'device-2',
        'sess-2',
        'jti-2',
      );

      expect(first.refreshToken).toMatch(/^sess-1\.[0-9a-f]{80}$/);
      expect(second.refreshToken).toMatch(/^sess-2\.[0-9a-f]{80}$/);
      expect(first.refreshToken.split('.')[1]).not.toBe(
        second.refreshToken.split('.')[1],
      );
    });

    it('không ghi refresh token ra log', async () => {
      const session = await service.createSession(
        'user-1',
        'ip',
        'UA',
        'device-1',
        'sess-1',
        'jti-1',
      );

      const logged = [...loggerLog.mock.calls, ...loggerWarn.mock.calls]
        .map(call => String(call[0]))
        .join('\n');

      expect(logged).not.toContain(session.refreshToken);
    });
  });

  describe('getSession', () => {
    it('đọc đúng key và parse JSON thành SessionData', async () => {
      const session = makeSession();
      redis.get.mockResolvedValue(JSON.stringify(session));

      await expect(service.getSession('sess-1')).resolves.toEqual(session);
      expect(redis.get).toHaveBeenCalledWith('auth:session:sess-1');
    });

    it('không có session trong Redis → trả null (không parse null)', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.getSession('sess-x')).resolves.toBeNull();
    });
  });

  describe('removeSession', () => {
    it('blacklist jti 1 giờ, xoá session và xoá khỏi set của user', async () => {
      redis.get.mockResolvedValue(JSON.stringify(makeSession()));
      redis.smembers.mockResolvedValue(['sess-1']);

      await expect(service.removeSession('sess-1')).resolves.toBeUndefined();

      expect(redis.set).toHaveBeenCalledWith(
        'auth:blacklist:jti-1',
        'true',
        3600,
      );
      expect(redis.del).toHaveBeenCalledWith('auth:session:sess-1');
      expect(redis.srem).toHaveBeenCalledWith(
        'auth:user:user-1:sessions',
        'sess-1',
      );
    });

    it('session không tồn tại → chỉ log warn, không xoá gì', async () => {
      redis.get.mockResolvedValue(null);

      await expect(service.removeSession('sess-x')).resolves.toBeUndefined();

      expect(loggerWarn).toHaveBeenCalledWith(
        expect.stringContaining('No session found for sessionId: sess-x'),
      );
      expect(redis.del).not.toHaveBeenCalled();
      expect(redis.srem).not.toHaveBeenCalled();
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('session không có jti → bỏ qua blacklist nhưng vẫn xoá session', async () => {
      redis.get.mockResolvedValue(
        JSON.stringify(makeSession({ jti: undefined as never })),
      );
      redis.smembers.mockResolvedValue([]);

      await service.removeSession('sess-1');

      expect(redis.set).not.toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalledWith('auth:session:sess-1');
      expect(redis.srem).toHaveBeenCalledWith(
        'auth:user:user-1:sessions',
        'sess-1',
      );
    });

    it('log khi xoá session không chứa refresh token', async () => {
      const session = makeSession();
      redis.get.mockResolvedValue(JSON.stringify(session));
      redis.smembers.mockResolvedValue(['sess-1']);

      await service.removeSession('sess-1');

      const logged = loggerLog.mock.calls
        .map(call => String(call[0]))
        .join('\n');
      expect(logged).not.toContain(session.refreshToken);
      expect(logged).toContain('auth:session:sess-1');
    });
  });

  describe('removeAllSessions', () => {
    it('xoá toàn bộ session của user trong set', async () => {
      const sessions: Record<string, SessionData> = {
        'auth:session:sess-1': makeSession({
          sessionId: 'sess-1',
          jti: 'jti-1',
        }),
        'auth:session:sess-2': makeSession({
          sessionId: 'sess-2',
          jti: 'jti-2',
        }),
      };
      redis.smembers.mockResolvedValue(['sess-1', 'sess-2']);
      redis.get.mockImplementation((key: string) =>
        sessions[key] ? JSON.stringify(sessions[key]) : null,
      );

      await service.removeAllSessions('user-1');

      expect(redis.smembers).toHaveBeenCalledWith('auth:user:user-1:sessions');
      expect(redis.del).toHaveBeenCalledWith('auth:session:sess-1');
      expect(redis.del).toHaveBeenCalledWith('auth:session:sess-2');
      expect(redis.set).toHaveBeenCalledWith(
        'auth:blacklist:jti-1',
        'true',
        3600,
      );
      expect(redis.set).toHaveBeenCalledWith(
        'auth:blacklist:jti-2',
        'true',
        3600,
      );
    });

    it('user không có session → không xoá gì', async () => {
      redis.smembers.mockResolvedValue([]);

      await service.removeAllSessions('user-1');

      expect(redis.del).not.toHaveBeenCalled();
      expect(redis.srem).not.toHaveBeenCalled();
    });
  });

  describe('getAllSessionsForUser', () => {
    it('trả các session hợp lệ, bỏ qua session đã hết hạn (null)', async () => {
      const valid = makeSession({ sessionId: 'sess-1' });
      redis.smembers.mockResolvedValue(['sess-1', 'sess-2']);
      redis.get.mockImplementation((key: string) =>
        key === 'auth:session:sess-1' ? JSON.stringify(valid) : null,
      );

      await expect(service.getAllSessionsForUser('user-1')).resolves.toEqual([
        valid,
      ]);
      expect(redis.smembers).toHaveBeenCalledWith('auth:user:user-1:sessions');
    });

    it('không có session nào → trả mảng rỗng', async () => {
      redis.smembers.mockResolvedValue([]);

      await expect(service.getAllSessionsForUser('user-1')).resolves.toEqual(
        [],
      );
    });
  });

  describe('token helpers', () => {
    it('generateOpaqueToken trả 80 ký tự hex', () => {
      expect(service.generateOpaqueToken()).toMatch(/^[0-9a-f]{80}$/);
    });

    it('generateRefreshToken ghép sessionId với token ngẫu nhiên', () => {
      const token = service.generateRefreshToken('sess-42');

      expect(token).toMatch(/^sess-42\.[0-9a-f]{80}$/);
    });
  });
});
