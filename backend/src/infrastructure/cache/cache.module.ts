import { Global, Module } from '@nestjs/common';
import {
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import { CACHE_SERVICE, RedisCacheService } from './redis-cache.service';
import { CacheMetrics } from './cache-metrics.service';

/** Module cache dùng chung, cung cấp `ICacheService`. */
@Global()
@Module({
  providers: [
    {
      provide: CACHE_SERVICE,
      useClass: RedisCacheService,
    },
    CacheMetrics,
    makeCounterProvider({
      name: 'cache_access_total',
      help: 'Số lần truy cập cache theo kết quả hit/miss.',
      labelNames: ['cache_type', 'outcome'],
    }),
    makeCounterProvider({
      name: 'cache_loader_runs_total',
      help: 'Số lần loader thật sự chạy (để so với số miss).',
      labelNames: ['cache_type'],
    }),
    makeCounterProvider({
      name: 'cache_lock_failed_total',
      help: 'Số lần không giành được lock cache.',
      labelNames: ['cache_type'],
    }),
    makeCounterProvider({
      name: 'cache_schema_rejected_total',
      help: 'Số lần dữ liệu loader không khớp schema cache.',
      labelNames: ['cache_type'],
    }),
    makeCounterProvider({
      name: 'cache_stale_served_total',
      help: 'Số lần phục stale khi không load được dữ liệu mới.',
      labelNames: ['cache_type'],
    }),
    makeHistogramProvider({
      name: 'cache_loader_duration_ms',
      help: 'Thời gian chạy loader cache (ms).',
      labelNames: ['cache_type'],
      buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 5000],
    }),
  ],
  exports: [CACHE_SERVICE, CacheMetrics],
})
export class CacheModule {}
