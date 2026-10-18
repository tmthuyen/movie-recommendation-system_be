import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { IUserRepository } from './users.repository';
import { RolesService } from '@/modules/roles/roles.service';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import { STORAGE_SERVICE } from '@/infrastructure/storage/storage.service';

// The "uuid" package ships an ESM-only build that Jest (CommonJS) cannot
// require directly, so it is mocked with a plain function.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000000' }));

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: IUserRepository, useValue: {} },
        { provide: RolesService, useValue: {} },
        { provide: UserProducer, useValue: {} },
        { provide: STORAGE_SERVICE, useValue: {} },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
