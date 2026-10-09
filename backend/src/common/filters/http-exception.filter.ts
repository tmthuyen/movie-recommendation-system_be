import { AppException } from '@/common/custom-exception/app-exception';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Catch(HttpException, AppException)
export class HttpExceptionFilter implements ExceptionFilter<
  HttpException | AppException
> {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  catch(exception: HttpException | AppException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode: HttpStatus;
    let message: string;
    let errorCode: string | undefined;

    // =========================
    // AppException
    // =========================

    if (exception instanceof AppException) {
      statusCode = exception.statusCode;
      message = exception.message;
      errorCode = exception.errorCode;

      // detailMessage dùng cho DEV LOG
      this.logger.error({
        time: new Date().toISOString(),
        method: request.method,
        path: request.originalUrl,
        statusCode,
        message: exception.message,
        detailMessage: exception.detailMessage,
        stack: exception.stack,
      });
    }

    // =========================
    // HttpException
    // =========================
    else {
      statusCode = exception.getStatus();

      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else {
        const data = exceptionResponse as {
          message?: string | string[];
          error?: string;
        };

        if (data.message && Array.isArray(data.message)) {
          message = data.message.join(', ');
        } else {
          message = data.message ?? exception.message;
        }

        // message = Array.isArray(data.message)
        //   ? 'Validation failed'
        //   : (data.message ?? exception.message);

        errorCode = data.error;
      }

      this.logger.error({
        time: new Date().toISOString(),
        method: request.method,
        path: request.originalUrl,
        statusCode,
        message: exception.message,
        detailMessage: exception.message,
        stack: exception.stack,
      });
    }

    // =========================
    // Response → Client
    // =========================

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      ...(errorCode && { errorCode }),
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
