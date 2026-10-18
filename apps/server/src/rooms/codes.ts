import { randomInt } from 'node:crypto';
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@party/shared';

/** 24^4 ≈ 330k codes; collisions are retried, and live rooms are few. */
export function generateRoomCode(isTaken: (code: string) => boolean, pick = randomInt): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[pick(ROOM_CODE_ALPHABET.length)];
    }
    if (!isTaken(code)) return code;
  }
  throw new Error('Could not allocate a room code');
}
