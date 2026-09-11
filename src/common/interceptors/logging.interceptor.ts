import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const { method, originalUrl, ip } = req;
    const userAgent = req.headers['user-agent'] || '';
    const now = Date.now();

    this.logger.info(`→ ${method} ${originalUrl} - ${ip} - ${userAgent}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          const { statusCode } = res;
          this.logger.info(
            `← ${method} ${originalUrl} ${statusCode} - ${duration}ms`,
          );
        },
        error: err => {
          const duration = Date.now() - now;
          const statusCode = err?.statusCode || 500;
          this.logger.error(
            `← ${method} ${originalUrl} ${statusCode} - ${duration}ms - ${err.message}`,
          );
        },
      }),
    );
  }
}
