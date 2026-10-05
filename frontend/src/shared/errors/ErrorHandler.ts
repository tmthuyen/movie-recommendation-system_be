import { AppError } from "@/shared/errors/AppError"

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  if (err instanceof Error) return new AppError(err.message)
  return new AppError("Unknown error")
}


