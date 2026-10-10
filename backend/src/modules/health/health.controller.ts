import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(
    private healthService: HealthCheckService,
    private http: HttpHealthIndicator,
    private typeOrmDb: TypeOrmHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  async check() {
    return this.healthService.check([
      () => this.typeOrmDb.pingCheck('database'),
    ]);
  }
}
