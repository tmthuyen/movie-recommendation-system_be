import { SetMetadata } from '@nestjs/common';
import { RateLimitOptions } from './rate-limit.interface';

export const RATE_LIMIT_KEY = 'RATE_LIMIT_OPTIONS';

export const RateLimit = (options: RateLimitOptions) => {
  return (
    target: any,
    key?: string | symbol,
    descriptor?: TypedPropertyDescriptor<any>,
  ) => {
    Reflect.defineMetadata(
      RATE_LIMIT_KEY,
      options,
      descriptor ? descriptor.value : target,
    );
  };
};
