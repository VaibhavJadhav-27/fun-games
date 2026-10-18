import { z } from 'zod';
import { GAME_IDS } from '../types';
import { NAME_MAX_LENGTH, isRoomCode, normalizeRoomCode } from '../limits';

// Control characters and zero-width/bidi marks would let names look identical or break layout.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g;

export const nameSchema = z
  .string()
  .max(64)
  .transform((s) => s.replace(INVISIBLE, '').replace(/\s+/g, ' ').trim())
  .pipe(
    z
      .string()
      .min(1, 'Enter a name')
      .max(NAME_MAX_LENGTH, `Max ${NAME_MAX_LENGTH} characters`),
  );

export const roomCodeSchema = z
  .string()
  .max(16)
  .transform(normalizeRoomCode)
  .refine(isRoomCode, 'Invalid room code');

export const gameIdSchema = z.enum(GAME_IDS);
export const playerIdSchema = z.string().min(1).max(64);
export const sessionTokenSchema = z.string().min(16).max(128);

const empty = z.strictObject({});

export const clientSchemas = {
  'time:sync': empty,
  'room:create': z.strictObject({ name: nameSchema, gameId: gameIdSchema }),
  'room:join': z.strictObject({ code: roomCodeSchema, name: nameSchema }),
  'room:resume': z.strictObject({ code: roomCodeSchema, sessionToken: sessionTokenSchema }),
  'room:leave': empty,
  'room:close': empty,
  'lobby:setGame': z.strictObject({ gameId: gameIdSchema }),
  'lobby:kick': z.strictObject({ playerId: playerIdSchema }),
  'game:start': empty,
} as const;

export type ClientEventName = keyof typeof clientSchemas;
export type ClientPayload<E extends ClientEventName> = z.input<(typeof clientSchemas)[E]>;
export type ParsedClientPayload<E extends ClientEventName> = z.output<(typeof clientSchemas)[E]>;
