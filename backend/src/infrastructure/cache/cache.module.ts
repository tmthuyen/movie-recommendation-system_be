import { Global, Module } from '@nestjs/common';
import { CACHE_SERVICE, RedisCacheService } from './redis-cache.service';

/** Module cache dùng chung, cung cấp `ICacheService`. */
@Global()
@Module({
  providers: [{ provide: CACHE_SERVICE, useClass: RedisCacheService }],
  exports: [CACHE_SERVICE],
})
export class CacheModule {}
