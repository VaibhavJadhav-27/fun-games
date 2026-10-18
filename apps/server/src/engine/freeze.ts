/**
 * Deep-freeze game state outside production, so a reducer that mutates its input
 * throws in tests instead of silently breaking rollback.
 */
export const FREEZE_STATE = process.env.NODE_ENV !== 'production';

export function deepFreeze<T>(value: T): T {
  if (!FREEZE_STATE || value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Reflect.ownKeys(value)) {
    deepFreeze((value as Record<PropertyKey, unknown>)[key]);
  }
  return Object.freeze(value);
}
