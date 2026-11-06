import { Global, Module } from '@nestjs/common';
import { ICacheService, RedisCacheService } from './redis-cache.service';

/** Module cache dùng chung, cung cấp `ICacheService`. */
@Global()
@Module({
  providers: [{ provide: ICacheService, useClass: RedisCacheService }],
  exports: [ICacheService],
})
export class CacheModule {}
