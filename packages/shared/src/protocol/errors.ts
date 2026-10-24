export const ERROR_CODES = [
  'BAD_REQUEST',
  'RATE_LIMITED',
  'NOT_IN_ROOM',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'NAME_TAKEN',
  'SESSION_INVALID',
  'NOT_HOST',
  'WRONG_STATUS',
  'INVALID_TARGET',
  'START_BLOCKED',
  'INVALID_SETTINGS',
  'WRONG_PHASE',
  'STALE_PHASE',
  'NOT_ALLOWED',
  'GAME_UNAVAILABLE',
  'INTERNAL',
  'TIMEOUT',
  'MAINTENANCE',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface ErrorInfo {
  code: ErrorCode;
  message: string;
}

export const DEFAULT_ERROR_MESSAGES: Record<ErrorCode, string> = {
  BAD_REQUEST: 'That request was not valid.',
  RATE_LIMITED: 'Slow down a little and try again.',
  NOT_IN_ROOM: 'You are not in this room.',
  ROOM_NOT_FOUND: 'That room does not exist or has ended.',
  ROOM_FULL: 'That room is full.',
  NAME_TAKEN: 'That name is taken in this room. Pick another.',
  SESSION_INVALID: 'Your session has expired.',
  NOT_HOST: 'Only the host can do that.',
  WRONG_STATUS: 'You cannot do that right now.',
  INVALID_TARGET: 'That player is not valid.',
  START_BLOCKED: 'The game cannot start yet.',
  INVALID_SETTINGS: 'Those settings are not valid.',
  WRONG_PHASE: 'You cannot do that right now.',
  STALE_PHASE: 'The game moved on. Try again.',
  NOT_ALLOWED: 'You cannot do that.',
  GAME_UNAVAILABLE: 'This game is not available yet.',
  INTERNAL: 'Something went wrong. Please try again.',
  TIMEOUT: 'The server did not respond. Check your connection.',
  MAINTENANCE: "We're doing some maintenance, so new rooms are paused. Try again soon.",
};
