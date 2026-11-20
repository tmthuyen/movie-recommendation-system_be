import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

/** Metric cache theo loại key. */
@Injectable()
export class CacheMetrics {
  constructor(
    @InjectMetric('cache_access_total')
    private readonly accessMetric: Counter<string>,
    @InjectMetric('cache_loader_runs_total')
    private readonly loaderRunsMetric: Counter<string>,
    @InjectMetric('cache_lock_failed_total')
    private readonly lockFailedMetric: Counter<string>,
    @InjectMetric('cache_schema_rejected_total')
    private readonly schemaRejectedMetric: Counter<string>,
    @InjectMetric('cache_stale_served_total')
    private readonly staleServedMetric: Counter<string>,
    @InjectMetric('cache_loader_duration_ms')
    private readonly loaderDurationMetric: Histogram<string>,
  ) {}

  hit(type: string): void {
    this.accessMetric.inc({ cache_type: type, outcome: 'hit' });
  }

  miss(type: string): void {
    this.accessMetric.inc({ cache_type: type, outcome: 'miss' });
  }

  loaderRun(type: string): void {
    this.loaderRunsMetric.inc({ cache_type: type });
  }

  lockFailed(type: string): void {
    this.lockFailedMetric.inc({ cache_type: type });
  }

  schemaRejected(type: string): void {
    this.schemaRejectedMetric.inc({ cache_type: type });
  }

  staleServed(type: string): void {
    this.staleServedMetric.inc({ cache_type: type });
  }

  observeLoader(type: string, durationMs: number): void {
    this.loaderDurationMetric.observe({ cache_type: type }, durationMs);
  }
}

/** Trả hai đoạn đầu của key sau prefix `cache:` để làm nhãn metric. */
export function cacheTypeFromKey(key: string): string {
  return (
    key
      .replace(/^cache:/, '')
      .split(':')
      .slice(0, 2)
      .join('_') || 'other'
  );
}
