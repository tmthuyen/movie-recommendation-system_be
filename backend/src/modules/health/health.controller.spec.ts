import { Test, TestingModule } from '@nestjs/testing';
import {
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';

// @nestjs/terminus publishes an ESM-only build that Jest (CommonJS) cannot
// require directly, so the module is mocked with plain classes.
jest.mock('@nestjs/terminus', () => ({
  HealthCheck: () => () => undefined,
  HealthCheckService: class HealthCheckService {},
  HttpHealthIndicator: class HttpHealthIndicator {},
  TypeOrmHealthIndicator: class TypeOrmHealthIndicator {},
}));

describe('HealthController', () => {
  let controller: HealthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: {} },
        { provide: HttpHealthIndicator, useValue: {} },
        { provide: TypeOrmHealthIndicator, useValue: {} },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
