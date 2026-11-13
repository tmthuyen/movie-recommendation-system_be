import type Redis from 'ioredis';

import { RedisService } from './redis.service';

type RedisMock = Record<
  | 'set'
  | 'get'
  | 'del'
  | 'keys'
  | 'sadd'
  | 'expire'
  | 'smembers'
  | 'srem'
  | 'hset'
  | 'hget'
  | 'hdel'
  | 'hgetall'
  | 'lpush'
  | 'rpush'
  | 'lrange'
  | 'lrem'
  | 'lpop'
  | 'multi'
  | 'zrangebyscore'
  | 'zcard'
  | 'disconnect',
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
      keys: jest.fn().mockResolvedValue([]),
      sadd: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      srem: jest.fn().mockResolvedValue(1),
      hset: jest.fn().mockResolvedValue(1),
      hget: jest.fn().mockResolvedValue(null),
      hdel: jest.fn().mockResolvedValue(1),
      hgetall: jest.fn().mockResolvedValue({}),
      lpush: jest.fn().mockResolvedValue(1),
      rpush: jest.fn().mockResolvedValue(1),
      lrange: jest.fn().mockResolvedValue([]),
      lrem: jest.fn().mockResolvedValue(1),
      lpop: jest.fn().mockResolvedValue(null),
      multi: jest.fn(() => multi),
      zrangebyscore: jest.fn().mockResolvedValue([]),
      zcard: jest.fn().mockResolvedValue(0),
      disconnect: jest.fn(),
    };

    service = new RedisService(client as unknown as Redis);
  });

  afterEach(() => jest.restoreAllMocks());

  it('getClient trả đúng instance client được inject', () => {
    expect(service.getClient()).toBe(client);
  });

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
  });

  describe('keys', () => {
    it('delByPattern xoá toàn bộ key khớp pattern', async () => {
      client.keys.mockResolvedValue(['a:1', 'a:2']);

      await service.delByPattern('a:*');

      expect(client.keys).toHaveBeenCalledWith('a:*');
      expect(client.del).toHaveBeenCalledWith('a:1', 'a:2');
    });

    it('delByPattern không gọi DEL khi không có key nào', async () => {
      client.keys.mockResolvedValue([]);

      await service.delByPattern('a:*');

      expect(client.del).not.toHaveBeenCalled();
    });

    it('getKeys trả danh sách key', async () => {
      client.keys.mockResolvedValue(['x', 'y']);

      await expect(service.getKeys('*')).resolves.toEqual(['x', 'y']);
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

    it('hget / hdel / hgetall chuyển tiếp đúng tham số', async () => {
      client.hget.mockResolvedValue('A');
      client.hgetall.mockResolvedValue({ name: 'A' });

      await expect(service.hget('user:1', 'name')).resolves.toBe('A');
      await service.hdel('user:1', 'name');
      await expect(service.hgetall('user:1')).resolves.toEqual({ name: 'A' });

      expect(client.hget).toHaveBeenCalledWith('user:1', 'name');
      expect(client.hdel).toHaveBeenCalledWith('user:1', 'name');
      expect(client.hgetall).toHaveBeenCalledWith('user:1');
    });
  });

  describe('list', () => {
    it('lpush / rpush / lrange / lrem / lpop chuyển tiếp đúng tham số', async () => {
      client.lrange.mockResolvedValue(['a', 'b']);
      client.lpop.mockResolvedValue('a');

      await service.lpush('queue', 'a');
      await service.rpush('queue', 'b');
      await expect(service.lrange('queue', 0, -1)).resolves.toEqual(['a', 'b']);
      await service.lrem('queue', 1, 'a');
      await expect(service.lpop('queue')).resolves.toBe('a');

      expect(client.lpush).toHaveBeenCalledWith('queue', 'a');
      expect(client.rpush).toHaveBeenCalledWith('queue', 'b');
      expect(client.lrange).toHaveBeenCalledWith('queue', 0, -1);
      expect(client.lrem).toHaveBeenCalledWith('queue', 1, 'a');
      expect(client.lpop).toHaveBeenCalledWith('queue');
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
  });

  it('lỗi từ client được ném lại cho caller (không nuốt)', async () => {
    client.get.mockRejectedValue(new Error('connection lost'));

    await expect(service.get('k')).rejects.toThrow('connection lost');
  });

  it('onModuleDestroy ngắt kết nối client', () => {
    service.onModuleDestroy();

    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });
});
