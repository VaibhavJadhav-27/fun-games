import type { ErrorCode } from '@party/shared';

export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function err<T = never>(code: ErrorCode): Result<T> {
  return { ok: false, code };
}
