import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';

import { AuthService } from './auth.service';
import { UsersService } from '@/modules/users/users.service';
import { RolesService } from '@/modules/roles/roles.service';
import { SessionService } from './session.service';
import { RedisService } from '@/infrastructure/redis/redis.service';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import { IMailService } from '@/infrastructure/mail/mail.service';
import { User, UserStatus } from '@/modules/users/entities/user.entity';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

// `uuid` là ESM-only, Jest (CommonJS) không require trực tiếp được.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000000' }));

const bcryptCompare = bcrypt.compare as unknown as jest.Mock;
const bcryptHash = bcrypt.hash as unknown as jest.Mock;

const activeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 1,
    email: 'a@example.com',
    password: 'hashed',
    fullName: 'Nguyen Van A',
    status: UserStatus.ACTIVE,
    isVerified: true,
    roles: [{ code: 'user' }],
    ...overrides,
  }) as unknown as User;

describe('AuthService', () => {
  let service: AuthService;
  let usersService: Record<string, jest.Mock>;
  let rolesService: Record<string, jest.Mock>;
  let jwtService: { sign: jest.Mock };
  let sessionService: Record<string, jest.Mock>;
  let redisService: Record<string, jest.Mock>;
  let userProducer: Record<string, jest.Mock>;
  let configService: { get: jest.Mock };
  let mailService: Record<string, jest.Mock>;
  let dataSource: { transaction: jest.Mock };

  beforeEach(() => {
    usersService = {
      findByEmail: jest.fn(),
      findByIdWithRoles: jest.fn(),
      create: jest.fn(),
      updateStatus: jest.fn(),
      updatePassword: jest.fn(),
    };
    rolesService = { findByCode: jest.fn() };
    jwtService = { sign: jest.fn().mockReturnValue('signed-access-token') };
    sessionService = {
      createSession: jest.fn().mockResolvedValue({
        sessionId: 's1',
        refreshToken: 'refresh-token-1',
      }),
      getSession: jest.fn(),
      removeSession: jest.fn(),
      removeAllSessions: jest.fn(),
      generateOpaqueToken: jest.fn().mockReturnValue('opaque-token'),
      getAllSessionsForUser: jest.fn(),
    };
    redisService = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
    };
    userProducer = {
      publishEmailVerificationRequested: jest.fn(),
      publishEmailVerified: jest.fn(),
    };
    configService = { get: jest.fn().mockReturnValue(undefined) };
    mailService = {
      sendVerificationEmail: jest.fn(),
    };
    dataSource = { transaction: jest.fn() };

    service = new AuthService(
      dataSource as unknown as DataSource,
      usersService as unknown as UsersService,
      rolesService as unknown as RolesService,
      jwtService as unknown as JwtService,
      sessionService as unknown as SessionService,
      redisService as unknown as RedisService,
      userProducer as unknown as UserProducer,
      configService as unknown as ConfigService,
      mailService as unknown as IMailService,
    );

    jest.spyOn(service['logger'], 'log').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('validateUser', () => {
    it('email không tồn tại → UnauthorizedException', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.validateUser({ username: 'x@example.com', password: 'p' }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it.each([UserStatus.BLOCKED, UserStatus.INACTIVE])(
      'tài khoản %s → UnauthorizedException "Tài khoản đã bị khóa"',
      async status => {
        usersService.findByEmail.mockResolvedValue(activeUser({ status }));

        await expect(
          service.validateUser({ username: 'a@example.com', password: 'p' }),
        ).rejects.toThrow('Tài khoản đã bị khóa');
      },
    );

    it('sai mật khẩu → UnauthorizedException', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser());
      bcryptCompare.mockResolvedValue(false);

      await expect(
        service.validateUser({ username: 'a@example.com', password: 'sai' }),
      ).rejects.toThrow('Email hoặc mật khẩu không chính xác');
    });

    it('đúng thông tin → trả user', async () => {
      const user = activeUser();
      usersService.findByEmail.mockResolvedValue(user);
      bcryptCompare.mockResolvedValue(true);

      await expect(
        service.validateUser({ username: 'a@example.com', password: 'dung' }),
      ).resolves.toBe(user);
    });
  });

  describe('login', () => {
    it('ký JWT với scope uppercase + tạo session', async () => {
      const res = await service.login(activeUser(), {
        deviceId: 'device-1',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });

      expect(jwtService.sign).toHaveBeenCalledWith(
        expect.objectContaining({
          sub: '1',
          email: 'a@example.com',
          scopes: ['USER'],
          sessionId: expect.any(String),
          jti: expect.any(String),
        }),
      );
      expect(sessionService.createSession).toHaveBeenCalledWith(
        1,
        '127.0.0.1',
        'jest',
        'device-1',
        expect.any(String),
        expect.any(String),
      );
      expect(res).toEqual({
        accessToken: 'signed-access-token',
        session: { sessionId: 's1', refreshToken: 'refresh-token-1' },
      });
    });

    it('thiếu deviceId → tự sinh UUID', async () => {
      await service.login(activeUser(), {
        deviceId: '',
        ipAddress: '127.0.0.1',
        userAgent: 'jest',
      });

      const deviceIdArg = sessionService.createSession.mock.calls[0][3];
      expect(typeof deviceIdArg).toBe('string');
      expect(deviceIdArg.length).toBeGreaterThan(10);
    });
  });

  describe('refreshToken', () => {
    const session = {
      sessionId: 's1',
      refreshToken: 's1.valid-refresh',
      userId: '1',
    };

    it('thiếu refreshToken → UnauthorizedException', async () => {
      await expect(
        service.refreshToken('', 'd', 'ua', 'ip'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('session không khớp token → UnauthorizedException và KHÔNG log token', async () => {
      sessionService.getSession.mockResolvedValue({
        ...session,
        refreshToken: 'other',
      });

      await expect(
        service.refreshToken('invalid-token', 'd', 'ua', 'ip'),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      const logged = (service['logger'].log as jest.Mock).mock.calls
        .flat()
        .join(' ');
      expect(logged).not.toContain('invalid-token');
      expect(logged).not.toContain('other');
    });

    it('user bị khoá → UnauthorizedException, không cấp token mới', async () => {
      sessionService.getSession.mockResolvedValue(session);
      usersService.findByIdWithRoles.mockResolvedValue(
        activeUser({ status: UserStatus.BLOCKED }),
      );

      await expect(
        service.refreshToken('s1.valid-refresh', 'd', 'ua', 'ip'),
      ).rejects.toThrow('Tài khoản bị khóa hoặc không tồn tại');
      expect(jwtService.sign).not.toHaveBeenCalled();
    });

    it('hợp lệ → thu hồi session cũ, tạo session mới cùng sessionId', async () => {
      sessionService.getSession.mockResolvedValue(session);
      usersService.findByIdWithRoles.mockResolvedValue(activeUser());

      const res = await service.refreshToken(
        's1.valid-refresh',
        'device-1',
        'ua',
        'ip',
      );

      expect(sessionService.removeSession).toHaveBeenCalledWith('s1');
      expect(sessionService.createSession).toHaveBeenCalledWith(
        1,
        'ip',
        'ua',
        'device-1',
        's1',
        expect.any(String),
      );
      expect(res).toEqual({
        accessToken: 'signed-access-token',
        refreshToken: 'refresh-token-1',
      });
    });
  });

  describe('verifyEmail', () => {
    it('token không tồn tại → BadRequestException', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(service.verifyEmail('bad')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('token hợp lệ → active hoá user, xoá token, publish event', async () => {
      redisService.get.mockResolvedValue('1');

      await service.verifyEmail('good');

      expect(usersService.updateStatus).toHaveBeenCalledWith(
        '1',
        UserStatus.ACTIVE,
        true,
      );
      expect(redisService.del).toHaveBeenCalledWith('auth:verify_email:good');
      expect(userProducer.publishEmailVerified).toHaveBeenCalledWith('1');
    });
  });

  describe('forgotPassword / resetPassword', () => {
    it('email không tồn tại → không gửi mail, không throw', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.forgotPassword('nobody@example.com'),
      ).resolves.toBeUndefined();
      expect(mailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('email tồn tại → lưu token reset 15 phút, gửi mail', async () => {
      usersService.findByEmail.mockResolvedValue(activeUser());

      await service.forgotPassword('a@example.com');

      expect(redisService.set).toHaveBeenCalledWith(
        'auth:reset_password:opaque-token',
        '1',
        15 * 60,
      );
      expect(mailService.sendVerificationEmail).toHaveBeenCalledWith(
        'a@example.com',
        'opaque-token',
      );
    });

    it('mật khẩu xác nhận không khớp → BadRequestException', async () => {
      await expect(
        service.resetPassword({
          token: 't',
          password: 'a',
          confirmPassword: 'b',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('token reset hết hạn → BadRequestException', async () => {
      redisService.get.mockResolvedValue(null);

      await expect(
        service.resetPassword({
          token: 't',
          password: 'a',
          confirmPassword: 'a',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('reset thành công → đổi mật khẩu, logout toàn bộ session', async () => {
      redisService.get.mockResolvedValue('1');
      bcryptHash.mockResolvedValue('hashed-new');

      await service.resetPassword({
        token: 't',
        password: 'new',
        confirmPassword: 'new',
      });

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        '1',
        'hashed-new',
      );
      expect(sessionService.removeAllSessions).toHaveBeenCalledWith('1');
      expect(redisService.del).toHaveBeenCalledWith('auth:reset_password:t');
    });
  });

  describe('changePassword', () => {
    it('xác nhận không khớp → BadRequestException', async () => {
      await expect(
        service.changePassword('1', {
          oldPassword: 'a',
          newPassword: 'b',
          confirmPassword: 'c',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('mật khẩu cũ sai → BadRequestException', async () => {
      usersService.findByIdWithRoles.mockResolvedValue(activeUser());
      bcryptCompare.mockResolvedValue(false);

      await expect(
        service.changePassword('1', {
          oldPassword: 'sai',
          newPassword: 'b',
          confirmPassword: 'b',
        }),
      ).rejects.toThrow('Mật khẩu cũ không chính xác');
    });

    it('thành công → cập nhật mật khẩu và logout toàn bộ', async () => {
      usersService.findByIdWithRoles.mockResolvedValue(activeUser());
      bcryptCompare.mockResolvedValue(true);
      bcryptHash.mockResolvedValue('hashed-new');

      await service.changePassword('1', {
        oldPassword: 'dung',
        newPassword: 'new',
        confirmPassword: 'new',
      });

      expect(usersService.updatePassword).toHaveBeenCalledWith(
        '1',
        'hashed-new',
      );
      expect(sessionService.removeAllSessions).toHaveBeenCalledWith('1');
    });
  });

  describe('getMe', () => {
    it('không có userId → UnauthorizedException', async () => {
      await expect(service.getMe('')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('user không tồn tại → UnauthorizedException', async () => {
      usersService.findByIdWithRoles.mockResolvedValue(null);

      await expect(service.getMe('1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('ẩn password khỏi kết quả', async () => {
      usersService.findByIdWithRoles.mockResolvedValue(activeUser());

      const res = await service.getMe('1');

      expect(res).not.toHaveProperty('password');
      expect(res).toMatchObject({ id: 1, email: 'a@example.com' });
    });
  });

  describe('register', () => {
    it('mật khẩu xác nhận không khớp → BadRequestException', async () => {
      await expect(
        service.register({
          email: 'a@example.com',
          password: 'a',
          confirmPassword: 'b',
        } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('tạo user với role mặc định + hash mật khẩu + gửi xác thực', async () => {
      bcryptHash.mockResolvedValue('hashed');
      rolesService.findByCode.mockResolvedValue({ id: 3, code: 'user' });
      usersService.create.mockResolvedValue({ id: 5, email: 'a@example.com' });
      usersService.findByIdWithRoles.mockResolvedValue(
        activeUser({ id: 5, isVerified: false } as unknown as Partial<User>),
      );

      const res = await service.register({
        email: 'a@example.com',
        password: 'secret',
        confirmPassword: 'secret',
        fullName: 'A',
      } as never);

      expect(usersService.create).toHaveBeenCalledWith(
        expect.objectContaining({ roleIds: [3], password: 'hashed' }),
      );
      expect(redisService.set).toHaveBeenCalledWith(
        'auth:verify_email:opaque-token',
        '5',
        24 * 60 * 60,
      );
      expect(res.message).toContain('Đăng ký thành công');
    });
  });

  describe('logout', () => {
    it('logoutBySessionId xoá session', async () => {
      await service.logoutBySessionId('s1');
      expect(sessionService.removeSession).toHaveBeenCalledWith('s1');
    });

    it('logoutAll xoá toàn bộ session của user', async () => {
      await service.logoutAll('1');
      expect(sessionService.removeAllSessions).toHaveBeenCalledWith('1');
    });

    it('getAllSessionsForUser đánh dấu session hiện tại', async () => {
      sessionService.getAllSessionsForUser.mockResolvedValue([
        { sessionId: 's1' },
        { sessionId: 's2' },
      ]);

      const res = await service.getAllSessionsForUser('1', 's2');

      expect(res).toEqual([
        { sessionId: 's1', isCurrentSession: false },
        { sessionId: 's2', isCurrentSession: true },
      ]);
    });
  });
});
