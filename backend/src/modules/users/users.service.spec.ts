import { ConflictException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

import { UsersService } from './users.service';
import { IUserRepository } from './users.repository';
import { RolesService } from '@/modules/roles/roles.service';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import { IStorageService } from '@/infrastructure/storage/storage.service';
import { User, UserStatus } from './entities/user.entity';
import { Role } from '@/modules/roles/entities/role.entity';

// `bcrypt` (native binding) và `uuid` (ESM-only) được mock để test chạy
// thuần unit, không cần build native / không cần DB.
jest.mock('bcrypt', () => ({
  hash: jest.fn(),
}));

jest.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000000' }));

const bcryptHash = bcrypt.hash as unknown as jest.Mock;

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'a@example.com',
    fullName: 'Nguyen Van A',
    password: 'hashed-old-password',
    status: UserStatus.ACTIVE,
    avatarUrl: null,
    roles: [],
    ...overrides,
  }) as unknown as User;

const makeRole = (id: number, code: string): Role =>
  ({ id, code, name: code, description: `${code} role` }) as Role;

describe('UsersService', () => {
  let service: UsersService;
  let repo: {
    save: jest.Mock;
    findByIdWithRoles: jest.Mock;
    findByEmail: jest.Mock;
    search: jest.Mock;
  };
  let roleService: { findAllByIds: jest.Mock };
  let producer: {
    publishUserCreated: jest.Mock;
    publishUserUpdated: jest.Mock;
    publishUserDeleted: jest.Mock;
  };
  let storage: Record<string, jest.Mock>;
  let loggerLog: jest.SpyInstance;

  beforeEach(() => {
    repo = {
      save: jest.fn((user: Partial<User>) => user as User),
      findByIdWithRoles: jest.fn(),
      findByEmail: jest.fn(),
      search: jest.fn(),
    };
    roleService = { findAllByIds: jest.fn().mockResolvedValue([]) };
    producer = {
      publishUserCreated: jest.fn(),
      publishUserUpdated: jest.fn(),
      publishUserDeleted: jest.fn(),
    };
    storage = {
      uploadFile: jest.fn().mockResolvedValue('https://cdn.local/new.png'),
      deleteFile: jest.fn().mockResolvedValue(undefined),
    };

    service = new UsersService(
      repo,
      roleService as unknown as RolesService,
      producer as unknown as UserProducer,
      storage as unknown as IStorageService,
    );

    // Logger của Nest làm ồn output test, đồng thời ta cần soi nội dung log
    // để chắc chắn mật khẩu dạng plaintext không bị ghi ra.
    loggerLog = jest
      .spyOn(service['logger'], 'log')
      .mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    bcryptHash.mockReset();
    bcryptHash.mockResolvedValue('hashed-new-password');
  });

  afterEach(() => jest.restoreAllMocks());

  describe('create', () => {
    it('email đã tồn tại → ném ConflictException, không lưu user', async () => {
      repo.findByEmail.mockResolvedValue(makeUser());

      await expect(
        service.create({
          email: 'a@example.com',
          password: 'plain',
          fullName: 'A',
          roleIds: [1],
        } as never),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(repo.save).not.toHaveBeenCalled();
      expect(roleService.findAllByIds).not.toHaveBeenCalled();
      expect(producer.publishUserCreated).not.toHaveBeenCalled();
    });

    it('tạo user với roles lấy từ RolesService và publish user.created', async () => {
      repo.findByEmail.mockResolvedValue(null);
      const roles = [makeRole(1, 'USER'), makeRole(2, 'ADMIN')];
      roleService.findAllByIds.mockResolvedValue(roles);
      repo.save.mockImplementation(
        (user: Partial<User>) =>
          ({
            id: 'user-9',
            status: UserStatus.UNVERIFIED,
            ...user,
          }) as User,
      );

      const created = await service.create({
        email: 'new@example.com',
        password: 'plain-secret',
        fullName: 'New User',
        roleIds: [1, 2],
      } as never);

      expect(roleService.findAllByIds).toHaveBeenCalledWith([1, 2]);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'new@example.com',
          fullName: 'New User',
          roles,
        }),
      );
      expect(created.id).toBe('user-9');
      expect(producer.publishUserCreated).toHaveBeenCalledWith({
        userId: 'user-9',
        email: 'new@example.com',
        fullName: 'New User',
        status: UserStatus.UNVERIFIED,
      });
    });

    it('không truyền roleIds → findAllByIds nhận undefined và roles rỗng', async () => {
      repo.findByEmail.mockResolvedValue(null);

      await service.create({
        email: 'new@example.com',
        password: 'plain-secret',
        fullName: 'New User',
      } as never);

      expect(roleService.findAllByIds).toHaveBeenCalledWith(undefined);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ roles: [] }),
      );
    });

    it('không log plaintext password khi tạo user mới', async () => {
      repo.findByEmail.mockResolvedValue(null);

      // create() không log, nhưng nếu sau này có thêm log thì cũng không được
      // chứa mật khẩu plaintext.
      await service.create({
        email: 'new@example.com',
        password: 'super-secret-plain',
        fullName: 'New User',
        roleIds: [],
      } as never);

      const logged = loggerLog.mock.calls
        .map(call => String(call[0]))
        .join('\n');
      expect(logged).not.toContain('super-secret-plain');
    });
  });

  describe('findAll', () => {
    it('mặc định page=1, limit=10 khi DTO rỗng và trả pagination', async () => {
      const data = [makeUser({ id: 'user-1' })];
      repo.search.mockResolvedValue([data, 23]);

      const result = await service.findAll({});

      expect(repo.search).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
      });
      expect(result).toEqual({
        result: data,
        pagination: {
          total: 23,
          page: 1,
          limit: 10,
          totalPages: 3,
        },
      });
    });

    it('truyền page/limit/keyword/filters/sort xuống repository', async () => {
      repo.search.mockResolvedValue([[], 11]);

      const result = await service.findAll({
        page: 3,
        limit: 5,
        keyword: 'an',
        filters: ['status:eq:ACTIVE'],
        sort: ['fullName:ASC'],
      });

      expect(repo.search).toHaveBeenCalledWith({
        page: 3,
        limit: 5,
        keyword: 'an',
        filters: ['status:eq:ACTIVE'],
        sort: ['fullName:ASC'],
      });
      expect(result.pagination.totalPages).toBe(3);
      expect(result.result).toEqual([]);
    });

    it('clamp page < 1 và limit ngoài khoảng 1..100', async () => {
      repo.search.mockResolvedValue([[], 0]);

      await service.findAll({ page: 0, limit: 500 });

      expect(repo.search).toHaveBeenCalledWith({
        page: 1,
        limit: 100,
      });
    });
  });

  describe('findOne / findByIdWithRoles / findByEmail', () => {
    it('findOne ném NotFoundException kèm id khi không tồn tại', async () => {
      repo.findByIdWithRoles.mockResolvedValue(null);

      await expect(service.findOne('missing-id')).rejects.toThrow(
        'User with ID missing-id not found',
      );
      await expect(service.findOne('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('findOne trả user kèm roles khi tồn tại', async () => {
      const user = makeUser({ roles: [makeRole(1, 'USER')] });
      repo.findByIdWithRoles.mockResolvedValue(user);

      await expect(service.findOne('user-1')).resolves.toBe(user);
      expect(repo.findByIdWithRoles).toHaveBeenCalledWith('user-1');
    });

    it('findByIdWithRoles ném NotFoundException khi không tìm thấy', async () => {
      repo.findByIdWithRoles.mockResolvedValue(null);

      await expect(
        service.findByIdWithRoles('missing-id'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('findByEmail trả null khi chưa có user và uỷ quyền cho repository', async () => {
      repo.findByEmail.mockResolvedValue(null);

      await expect(
        service.findByEmail('nobody@example.com'),
      ).resolves.toBeNull();
      expect(repo.findByEmail).toHaveBeenCalledWith('nobody@example.com');
    });
  });

  describe('update', () => {
    it('hash password trước khi lưu (không lưu plaintext) và publish user.updated', async () => {
      const user = makeUser();
      repo.findByIdWithRoles.mockResolvedValue(user);

      const dto = {
        fullName: 'Ten Moi',
        password: 'plain-secret',
      } as never;

      const updated = await service.update('user-1', dto);

      expect(bcryptHash).toHaveBeenCalledWith('plain-secret', 10);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'user-1',
          fullName: 'Ten Moi',
          password: 'hashed-new-password',
        }),
      );
      expect(updated.password).toBe('hashed-new-password');
      expect(updated.password).not.toBe('plain-secret');
      expect(producer.publishUserUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', email: user.email }),
      );
    });

    it('không ghi plaintext password vào log', async () => {
      repo.findByIdWithRoles.mockResolvedValue(makeUser());

      // DTO bị Object.assign vào entity; log phải chứa hash, không chứa plaintext.
      await service.update('user-1', { password: 'plain-secret' });

      const logged = loggerLog.mock.calls
        .map(call => String(call[0]))
        .join('\n');
      expect(logged).toContain('hashed-new-password');
      expect(logged).not.toContain('plain-secret');
    });

    it('không hash khi không đổi password', async () => {
      repo.findByIdWithRoles.mockResolvedValue(makeUser());

      await service.update('user-1', { fullName: 'Chi Doi Ten' });

      expect(bcryptHash).not.toHaveBeenCalled();
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ fullName: 'Chi Doi Ten' }),
      );
    });

    it('user không tồn tại → NotFoundException, không lưu', async () => {
      repo.findByIdWithRoles.mockResolvedValue(null);

      await expect(
        service.update('missing-id', { fullName: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.save).not.toHaveBeenCalled();
      expect(producer.publishUserUpdated).not.toHaveBeenCalled();
    });
  });

  describe('remove / status / password', () => {
    it('remove chuyển status sang BLOCKED, lưu và publish user.deleted', async () => {
      const user = makeUser();
      repo.findByIdWithRoles.mockResolvedValue(user);

      const removed = await service.remove('user-1');

      expect(removed.status).toBe(UserStatus.BLOCKED);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', status: UserStatus.BLOCKED }),
      );
      expect(producer.publishUserDeleted).toHaveBeenCalledWith('user-1');
    });

    it('remove user không tồn tại → NotFoundException, không publish', async () => {
      repo.findByIdWithRoles.mockResolvedValue(null);

      await expect(service.remove('missing-id')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(producer.publishUserDeleted).not.toHaveBeenCalled();
    });

    it('updateStatus không có isVerified chỉ lưu id + status', async () => {
      await service.updateStatus('user-1', UserStatus.BLOCKED);

      expect(repo.save).toHaveBeenCalledWith({
        id: 'user-1',
        status: UserStatus.BLOCKED,
      });
    });

    it('updateStatus có isVerified lưu kèm cờ isVerified', async () => {
      await service.updateStatus('user-1', UserStatus.ACTIVE, true);

      expect(repo.save).toHaveBeenCalledWith({
        id: 'user-1',
        status: UserStatus.ACTIVE,
        isVerified: true,
      });
    });

    it('updatePassword lưu hash đã được caller tạo sẵn', async () => {
      await service.updatePassword('user-1', 'hashed-new-password');

      expect(repo.save).toHaveBeenCalledWith({
        id: 'user-1',
        password: 'hashed-new-password',
      });
    });
  });

  describe('assignRoles', () => {
    it('thay toàn bộ roles của user và lưu', async () => {
      const user = makeUser({ roles: [makeRole(1, 'USER')] });
      const newRoles = [makeRole(3, 'ADMIN')];
      repo.findByIdWithRoles.mockResolvedValue(user);
      roleService.findAllByIds.mockResolvedValue(newRoles);

      const result = await service.assignRoles('user-1', [3]);

      expect(result.roles).toEqual(newRoles);
      expect(repo.save).toHaveBeenCalledWith(user);
    });

    it('user không tồn tại → NotFoundException, không gọi RolesService', async () => {
      repo.findByIdWithRoles.mockResolvedValue(null);

      await expect(
        service.assignRoles('missing-id', [3]),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(roleService.findAllByIds).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('updateAvatar', () => {
    it('có avatar cũ → xoá avatar cũ, upload avatar mới, lưu và trả URL', async () => {
      const user = makeUser({ avatarUrl: 'https://cdn.local/old.png' });
      repo.findByIdWithRoles.mockResolvedValue(user);
      storage.uploadFile.mockResolvedValue('https://cdn.local/new.png');
      const file = { originalname: 'a.png' } as unknown as Express.Multer.File;

      await expect(
        service.updateAvatar('user-1', file, 'uploads/avatars'),
      ).resolves.toBe('https://cdn.local/new.png');

      expect(storage.deleteFile).toHaveBeenCalledWith(
        'https://cdn.local/old.png',
      );
      expect(storage.uploadFile).toHaveBeenCalledWith(file, 'uploads/avatars');
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ avatarUrl: 'https://cdn.local/new.png' }),
      );
    });

    it('chưa có avatar cũ → bỏ qua bước xoá file', async () => {
      repo.findByIdWithRoles.mockResolvedValue(
        makeUser({ avatarUrl: undefined }),
      );

      await service.updateAvatar(
        'user-1',
        { originalname: 'a.png' } as unknown as Express.Multer.File,
        'uploads/avatars',
      );

      expect(storage.deleteFile).not.toHaveBeenCalled();
      expect(storage.uploadFile).toHaveBeenCalled();
    });

    it('user không tồn tại → NotFoundException, không upload', async () => {
      repo.findByIdWithRoles.mockResolvedValue(null);

      await expect(
        service.updateAvatar(
          'missing-id',
          { originalname: 'a.png' } as unknown as Express.Multer.File,
          'uploads/avatars',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(storage.uploadFile).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });
});
