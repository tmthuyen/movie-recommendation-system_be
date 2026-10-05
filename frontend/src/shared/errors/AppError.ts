export class AppError extends Error {
  public code: string;
  public status: number;
  public details?: unknown;
  publicMessage?: string;

  constructor(
    message: string = 'An error occurred',
    code = 'APP_ERROR',
    status = 500,
    details?: unknown,
    publicMessage?: string
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.publicMessage = publicMessage;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  // builder apperror
  static builder() {
    return new AppError();
  }

  withMessage(message: string) {
    this.message = message;
    return this;
  }

  withCode(code: string) {
    this.code = code;
    return this;
  }

  withStatus(status: number) {
    this.status = status;
    return this;
  }

  withDetails(details: unknown) {
    this.details = details;
    return this;
  }

  withPublicMessage(publicMessage: string) {
    this.publicMessage = publicMessage;
    return this;
  }
}

export default AppError;
