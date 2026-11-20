import type Redis from 'ioredis';

import { RedisService } from './redis.service';

type RedisMock = Record<
  | 'set'
  | 'get'
  | 'del'
  | 'mget'
  | 'sadd'
  | 'expire'
  | 'smembers'
  | 'srem'
  | 'hset'
  | 'hsetnx'
  | 'hgetall'
  | 'hincrby'
  | 'multi'
  | 'zadd'
  | 'zrangebyscore'
  | 'zcard'
  | 'zincrby'
  | 'zrevrange',
  jest.Mock
>;

describe('RedisService', () => {
  let client: RedisMock;
  let multi: {
    zadd: jest.Mock;
    expire: jest.Mock;
    exec: jest.Mock;
  };
  let service: RedisService;

  beforeEach(() => {
    multi = {
      zadd: jest.fn(),
      expire: jest.fn(),
      exec: jest.fn().mockResolvedValue([]),
    };
    multi.zadd.mockReturnValue(multi);
    multi.expire.mockReturnValue(multi);

    client = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn().mockResolvedValue(null),
      del: jest.fn().mockResolvedValue(1),
      mget: jest.fn().mockResolvedValue([]),
      sadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      srem: jest.fn().mockResolvedValue(1),
      hset: jest.fn().mockResolvedValue(1),
      hsetnx: jest.fn().mockResolvedValue(1),
      hgetall: jest.fn().mockResolvedValue({}),
      hincrby: jest.fn().mockResolvedValue(1),
      multi: jest.fn(() => multi),
      zadd: jest.fn().mockResolvedValue(1),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      zcard: jest.fn().mockResolvedValue(0),
      zincrby: jest.fn().mockResolvedValue('1'),
      zrevrange: jest.fn().mockResolvedValue([]),
    };

    service = new RedisService(client as unknown as Redis);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('string', () => {
    it('set có TTL → dùng lệnh SET kèm EX', async () => {
      await service.set('session:1', 'payload', 60);

      expect(client.set).toHaveBeenCalledWith('session:1', 'payload', 'EX', 60);
    });

    it('set không có TTL (hoặc TTL = 0) → SET 2 tham số', async () => {
      await service.set('session:1', 'payload');
      await service.set('session:2', 'payload', 0);

      expect(client.set).toHaveBeenNthCalledWith(1, 'session:1', 'payload');
      expect(client.set).toHaveBeenNthCalledWith(2, 'session:2', 'payload');
    });

    it('get trả giá trị từ client (kể cả null)', async () => {
      client.get.mockResolvedValueOnce('value');
      await expect(service.get('k')).resolves.toBe('value');

      client.get.mockResolvedValueOnce(null);
      await expect(service.get('missing')).resolves.toBeNull();
    });

    it('del gọi DEL với key', async () => {
      await service.del('k');

      expect(client.del).toHaveBeenCalledWith('k');
    });

    it('mget truyền danh sách key và trả kết quả theo thứ tự', async () => {
      client.mget.mockResolvedValue(['a', null]);

      await expect(service.mget(['k1', 'k2'])).resolves.toEqual(['a', null]);
      expect(client.mget).toHaveBeenCalledWith('k1', 'k2');
    });
  });

  describe('set', () => {
    it('sadd thêm member rồi set expire', async () => {
      await service.sadd('roles:1', 'ADMIN', 300);

      expect(client.sadd).toHaveBeenCalledWith('roles:1', 'ADMIN');
      expect(client.expire).toHaveBeenCalledWith('roles:1', 300);
    });

    it('smembers và srem chuyển tiếp đúng tham số', async () => {
      client.smembers.mockResolvedValue(['ADMIN']);

      await expect(service.smembers('roles:1')).resolves.toEqual(['ADMIN']);
      await service.srem('roles:1', 'ADMIN');

      expect(client.srem).toHaveBeenCalledWith('roles:1', 'ADMIN');
    });
  });

  describe('hash', () => {
    it('hset ghi object rồi set expire', async () => {
      const obj = { name: 'A', age: '20' };

      await service.hset('user:1', obj, 120);

      expect(client.hset).toHaveBeenCalledWith('user:1', obj);
      expect(client.expire).toHaveBeenCalledWith('user:1', 120);
    });

    it('hgetall chuyển tiếp đúng tham số', async () => {
      client.hgetall.mockResolvedValue({ name: 'A' });

      await expect(service.hgetall('user:1')).resolves.toEqual({ name: 'A' });
      expect(client.hgetall).toHaveBeenCalledWith('user:1');
    });

    it('hincrby trả giá trị số', async () => {
      client.hincrby.mockResolvedValue('7');

      await expect(service.hincrby('user:1', 'likeCount', 1)).resolves.toBe(7);
      expect(client.hincrby).toHaveBeenCalledWith('user:1', 'likeCount', 1);
    });

    it('hsetIfAbsent chỉ ghi hash khi HSETNX thành công', async () => {
      const obj = { likeCount: '0' };
      client.hsetnx.mockResolvedValueOnce(1);

      await service.hsetIfAbsent('user:1', obj, 120);

      expect(client.hsetnx).toHaveBeenCalledWith('user:1', 'likeCount', '0');
      expect(client.hset).toHaveBeenCalledWith('user:1', obj);
      expect(client.expire).toHaveBeenCalledWith('user:1', 120);
    });

    it('hsetIfAbsent bỏ qua khi field đã tồn tại', async () => {
      client.hsetnx.mockResolvedValueOnce(0);

      await service.hsetIfAbsent('user:1', { likeCount: '0' }, 120);

      expect(client.hset).not.toHaveBeenCalled();
      expect(client.expire).not.toHaveBeenCalled();
    });
  });

  describe('sorted set', () => {
    it('zadd ghi nhiều entry trong một multi kèm expire', async () => {
      await service.zadd(
        'rec:semantic:k100',
        [
          { score: 1, member: '{"id":1,"rank":1,"score":0.9}' },
          { score: 2, member: '{"id":2,"rank":2,"score":0.8}' },
        ],
        900,
      );

      expect(multi.zadd).toHaveBeenCalledWith(
        'rec:semantic:k100',
        1,
        '{"id":1,"rank":1,"score":0.9}',
        2,
        '{"id":2,"rank":2,"score":0.8}',
      );
      expect(multi.expire).toHaveBeenCalledWith('rec:semantic:k100', 900);
      expect(multi.exec).toHaveBeenCalledTimes(1);
    });

    it('zadd bỏ qua khi không có entry', async () => {
      await service.zadd('rec:semantic:k100', [], 900);

      expect(client.multi).not.toHaveBeenCalled();
    });

    it('zrangeByScore truyền LIMIT 0 limit', async () => {
      client.zrangebyscore.mockResolvedValue(['a', 'b']);

      await expect(
        service.zrangeByScore('rec:semantic:k100', '(2', '+inf', 12),
      ).resolves.toEqual(['a', 'b']);
      expect(client.zrangebyscore).toHaveBeenCalledWith(
        'rec:semantic:k100',
        '(2',
        '+inf',
        'LIMIT',
        0,
        12,
      );
    });

    it('zcard trả số phần tử trong set', async () => {
      client.zcard.mockResolvedValue(5);

      await expect(service.zcard('rec:semantic:k100')).resolves.toBe(5);
      expect(client.zcard).toHaveBeenCalledWith('rec:semantic:k100');
    });

    it('zincrby trả điểm mới và set expire', async () => {
      client.zincrby.mockResolvedValue('3');

      await expect(
        service.zincrby('stats:hot:view:all', 1, '1', 3600),
      ).resolves.toBe(3);
      expect(client.zincrby).toHaveBeenCalledWith('stats:hot:view:all', 1, '1');
      expect(client.expire).toHaveBeenCalledWith('stats:hot:view:all', 3600);
    });

    it('zaddMax chỉ ghi điểm lớn hơn điểm cũ', async () => {
      await service.zaddMax('stats:hot:view:all', 5, '1', 3600);

      expect(client.zadd).toHaveBeenCalledWith(
        'stats:hot:view:all',
        'GT',
        5,
        '1',
      );
      expect(client.expire).toHaveBeenCalledWith('stats:hot:view:all', 3600);
    });

    it('zrevrangeWithScores trả danh sách member kèm điểm', async () => {
      client.zrevrange.mockResolvedValue(['1', '5', '2', '3']);

      await expect(
        service.zrevrangeWithScores('stats:hot:view:all', 0, 9),
      ).resolves.toEqual([
        { member: '1', score: 5 },
        { member: '2', score: 3 },
      ]);
      expect(client.zrevrange).toHaveBeenCalledWith(
        'stats:hot:view:all',
        0,
        9,
        'WITHSCORES',
      );
    });
  });

  it('lỗi từ client được ném lại cho caller (không nuốt)', async () => {
    client.get.mockRejectedValue(new Error('connection lost'));

    await expect(service.get('k')).rejects.toThrow('connection lost');
  });
});
