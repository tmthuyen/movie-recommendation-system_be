import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  type LoggerService,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { trace } from '@opentelemetry/api';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: LoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    const { method, originalUrl, ip } = req;
    const userAgent = req.headers['user-agent'] || '';
    const now = Date.now();
    const headers = req.headers;
    const activeSpan = trace.getActiveSpan();
    const traceID = activeSpan ? activeSpan.spanContext().traceId : 'None';
    const reqID = (headers['x-request-id'] as string) || '';
    const kongID = (headers['x-kong-request-id'] as string) || '';

    if (!reqID || !kongID) {
      this.logger.error('Missing request ID or kong ID');
    }

    this.logger.log(
      `[Trace ID]: ${traceID} - [Request ID]: ${reqID} - [Kong ID]: ${kongID}`,
    );
    this.logger.log(`→ ${method} ${originalUrl} - ${ip} - ${userAgent}`);

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - now;
          const { statusCode } = res;
          this.logger.log(
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
