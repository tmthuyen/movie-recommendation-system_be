import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT, RedisService } from './redis.service';
import {
  REDIS_LOCK_SERVICE,
  RedisLockService,
} from '@/infrastructure/redis/redis-lock.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService) => {
        const host = configService.get<string>('REDIS_HOST', 'localhost');
        const port = configService.get<number>('REDIS_PORT', 6379);
        return new Redis({ host, port });
      },
      inject: [ConfigService],
    },
    RedisService,
    {
      provide: REDIS_LOCK_SERVICE,
      useClass: RedisLockService,
    },
  ],
  exports: [REDIS_CLIENT, RedisService, REDIS_LOCK_SERVICE],
})
export class RedisModule {}
