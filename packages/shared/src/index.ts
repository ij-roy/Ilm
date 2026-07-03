export type Ok<T> = {
  readonly ok: true;
  readonly value: T;
};

export type Err<E extends AppError = AppError> = {
  readonly ok: false;
  readonly error: E;
};

export type Result<T, E extends AppError = AppError> = Ok<T> | Err<E>;

export type AppErrorCode =
  | "validation_error"
  | "authentication_error"
  | "authorization_error"
  | "not_found"
  | "rate_limited"
  | "conflict"
  | "network_error"
  | "unknown_error";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly details: Record<string, unknown> | undefined;

  constructor(code: AppErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E extends AppError>(error: E): Err<E> {
  return { ok: false, error };
}

export function isOk<T, E extends AppError>(result: Result<T, E>): result is Ok<T> {
  return result.ok;
}

export function isErr<T, E extends AppError>(result: Result<T, E>): result is Err<E> {
  return !result.ok;
}

export function validationError(message: string, details?: Record<string, unknown>): AppError {
  return new AppError("validation_error", message, details);
}
