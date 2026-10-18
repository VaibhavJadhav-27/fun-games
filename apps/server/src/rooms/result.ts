import type { ErrorCode } from '@party/shared';

export type Result<T> = { ok: true; value: T } | { ok: false; code: ErrorCode; message?: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

/** `message` overrides the default text for the code (e.g. why the game can't start). */
export function err<T = never>(code: ErrorCode, message?: string): Result<T> {
  return message === undefined ? { ok: false, code } : { ok: false, code, message };
}
