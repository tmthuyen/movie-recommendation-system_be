import {
  ExecutionContext,
  ForbiddenException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';

import { ROLES_KEY } from '@/common/decorators/roles.decorator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@/modules/auth/guards/roles.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User, UserStatus } from './entities/user.entity';

// The "uuid" package ships an ESM-only build that Jest (CommonJS) cannot
// require directly, so it is mocked with a plain function.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000000' }));

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: 'a@example.com',
    fullName: 'Nguyen Van A',
    password: 'secret',
    status: UserStatus.ACTIVE,
    roles: [],
    ...overrides,
  }) as unknown as User;

describe('UsersController', () => {
  let controller: UsersController;
  let service: { findAll: jest.Mock; findOne: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    service = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  describe('phân quyền', () => {
    it('controller có JwtAuthGuard + RolesGuard, PUT :id yêu cầu ADMIN/SUPERADMIN', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        UsersController,
      ) as Array<new (...args: never[]) => unknown>;
      expect(guards).toEqual([JwtAuthGuard, RolesGuard]);
      const updateHandler = Object.getOwnPropertyDescriptor(
        UsersController.prototype,
        'update',
      )?.value as object;
      expect(Reflect.getMetadata(ROLES_KEY, updateHandler)).toEqual([
        'ADMIN',
        'SUPERADMIN',
      ]);
    });

    it('user thường gọi PUT /users/:id → ForbiddenException', () => {
      const guard = new RolesGuard({
        getAllAndOverride: jest.fn().mockReturnValue(['ADMIN', 'SUPERADMIN']),
      } as unknown as Reflector);
      const context = {
        getHandler: () => () => undefined,
        getClass: () => UsersController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { sub: 'user-2', scopes: ['USER'] } }),
        }),
      } as unknown as ExecutionContext;

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('findAll', () => {
    it('trả envelope + pagination và ẩn password', async () => {
      const users = [makeUser()];
      service.findAll.mockResolvedValue({
        result: users,
        pagination: { total: 1, page: 1, limit: 10, totalPages: 1 },
      });

      const response = await controller.findAll({
        page: 1,
        limit: 10,
        keyword: 'a@example.com',
      });

      expect(service.findAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        keyword: 'a@example.com',
      });
      expect(response.success).toBe(true);
      expect(response.statusCode).toBe(200);
      expect(response.pagination).toEqual({
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
      expect(response.result).toHaveLength(1);
      expect(response.result[0]).not.toHaveProperty('password');
    });
  });

  it('PUT /users/:id truyền actorId từ JWT xuống service và giữ envelope', async () => {
    const dto = { status: UserStatus.BLOCKED };
    service.update.mockResolvedValue(makeUser({ status: UserStatus.BLOCKED }));

    const response = await controller.update(
      { user: { sub: 'admin-1' } } as never,
      'user-2',
      dto,
    );

    expect(service.update).toHaveBeenCalledWith('user-2', dto, 'admin-1');
    expect(response.success).toBe(true);
    expect(response.statusCode).toBe(HttpStatus.OK);
    expect(response.result).not.toHaveProperty('password');
  });
});
