import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { UsersService } from '@/modules/users/users.service';
import { RolesService } from '@/modules/roles/roles.service';
import { SessionService } from './session.service';
import { RedisService } from '@/infrastructure/redis/redis.service';
import { UserProducer } from '@/infrastructure/messaging/producers/user.producer';
import { IMailService } from '@/infrastructure/mail/mail.service';

// The "uuid" package ships an ESM-only build that Jest (CommonJS) cannot
// require directly, so it is mocked with a plain function.
jest.mock('uuid', () => ({ v4: () => '00000000-0000-0000-0000-000000000000' }));

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DataSource, useValue: {} },
        { provide: UsersService, useValue: {} },
        { provide: RolesService, useValue: {} },
        { provide: JwtService, useValue: {} },
        { provide: SessionService, useValue: {} },
        { provide: RedisService, useValue: {} },
        { provide: UserProducer, useValue: {} },
        { provide: ConfigService, useValue: {} },
        { provide: IMailService, useValue: {} },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
