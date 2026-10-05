export type DomainErrorType = 'Validation' | 'Business' | 'NotFound' | 'Forbidden'

export class DomainError extends Error {
  type: DomainErrorType
  meta?: unknown

  constructor(message: string, type: DomainErrorType = 'Business', meta?: unknown) {
    super(message)
    this.type = type
    this.meta = meta
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export default DomainError
