import AppError from './errors/AppError';
import DomainError from './errors/DomainError';
import InfrastructureError from './errors/InfrastructureError';

export function mapToAppError(err: unknown): AppError {
  console.error('MAPPING ERROR:', err);
  if (err instanceof AppError) return err;

  if (err instanceof DomainError) {
    switch (err.type) {
      case 'Validation':
        return new AppError(err.message, 'DOMAIN_VALIDATION', 400, undefined, err.message);
      case 'NotFound':
        return new AppError(err.message, 'DOMAIN_NOT_FOUND', 404, undefined, err.message);
      case 'Forbidden':
        return new AppError(err.message, 'DOMAIN_FORBIDDEN', 403, undefined, err.message);
      case 'Business':
      default:
        return new AppError(err.message, 'DOMAIN_BUSINESS', 422, undefined, err.message);
    }
  }

  if (err instanceof InfrastructureError) {
    // map some common infra codes to HTTP
    if (err.code === 'P2002' || err.code === 'UNIQUE_CONSTRAINT') {
      return new AppError(err.message ?? 'Conflict', 'INFRA_CONFLICT', 409, err.code, 'Conflict');
    }
    return new AppError('Dependency error', 'INFRA_DEP', 502, err.code, 'Dependency error');
  }

  // Prisma known error
  const maybe = err as { code?: string; message?: string } | undefined;
  if (maybe && maybe.code) {
    if (maybe.code === 'P2002')
      return new AppError(
        maybe.message ?? 'Conflict',
        'PRISMA_CONFLICT',
        409,
        maybe.code,
        'Conflict'
      );
  }

  // fallback
  const message = maybe && maybe.message ? String(maybe.message) : 'Internal server error';
  return new AppError(message, 'INTERNAL', 500, undefined, 'Internal server error');
}

export default mapToAppError;
