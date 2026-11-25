import { HttpStatus } from '@nestjs/common';

export class AppException extends Error {
  statusCode: HttpStatus | number;
  detailMessage: string;
  errorCode?: string;

  constructor(
    statusCode: HttpStatus | number,
    message: string,
    detailMessage: string,
    errorCode: string,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.detailMessage = detailMessage;
    this.errorCode = errorCode;
  }
}
