import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  CannotCreateEntityIdMapError,
  EntityNotFoundError,
  EntityPropertyNotFoundError,
  QueryFailedError,
} from 'typeorm';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';

@Catch(
  QueryFailedError,
  EntityNotFoundError,
  EntityPropertyNotFoundError,
  CannotCreateEntityIdMapError,
)
export class TypeOrmExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(WINSTON_MODULE_PROVIDER)
    private readonly logger: Logger,
  ) {}

  catch(exception: Error, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Đã xảy ra lỗi cơ sở dữ liệu';

    if (exception instanceof QueryFailedError) {
      const error = exception.driverError as {
        code?: string;
        constraint?: string;
      };

      switch (error.code) {
        // PostgreSQL: Unique violation
        case '23505':
          statusCode = HttpStatus.CONFLICT;
          message = 'Dữ liệu đã tồn tại';
          break;

        // PostgreSQL: Foreign key violation
        case '23503':
          statusCode = HttpStatus.CONFLICT;
          message = 'Dữ liệu tham chiếu không tồn tại hoặc đang được sử dụng';
          break;

        // PostgreSQL: Not null violation
        case '23502':
          statusCode = HttpStatus.BAD_REQUEST;
          message = 'Thiếu dữ liệu bắt buộc';
          break;

        // PostgreSQL: Check constraint violation
        case '23514':
          statusCode = HttpStatus.BAD_REQUEST;
          message = 'Dữ liệu không hợp lệ';
          break;

        // PostgreSQL: Invalid text representation
        case '22P02':
          statusCode = HttpStatus.BAD_REQUEST;
          message = 'Định dạng dữ liệu không hợp lệ';
          break;
      }
    } else if (exception instanceof EntityNotFoundError) {
      statusCode = HttpStatus.NOT_FOUND;
      message = 'Không tìm thấy dữ liệu yêu cầu';
    } else if (exception instanceof CannotCreateEntityIdMapError) {
      statusCode = HttpStatus.BAD_REQUEST;
      message = 'Không thể xác định ID của dữ liệu';
    } else if (exception instanceof EntityPropertyNotFoundError) {
      statusCode = HttpStatus.UNPROCESSABLE_ENTITY;
      message = 'Thuộc tính dữ liệu không tồn tại';
    }

    this.logger.error({
      time: new Date().toISOString(),
      method: request.method,
      path: request.originalUrl,
      statusCode,
      message,
      detailMessage: exception.message,
      stack: exception.stack,
    });

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.originalUrl,
    });
  }
}
