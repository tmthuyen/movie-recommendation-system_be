export class InfrastructureError extends Error {
  code?: string
  cause?: any

  constructor(message: string, code?: string, cause?: any) {
    super(message)
    this.code = code
    this.cause = cause
    Object.setPrototypeOf(this, new.target.prototype)
  }
}

export default InfrastructureError
