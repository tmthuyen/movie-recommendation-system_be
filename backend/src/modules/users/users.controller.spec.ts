import { Test, TestingModule } from '@nestjs/testing';
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
  let service: { findAll: jest.Mock };

  beforeEach(async () => {
    service = { findAll: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: service }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
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
});
