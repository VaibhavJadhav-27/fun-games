type Level = 'info' | 'warn' | 'error';

/** JSON lines. Never log names, session tokens or payload contents. */
function write(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  if (level === 'error') console.error(line);
  else console.log(line);
}

export const log = {
  info: (msg: string, fields?: Record<string, unknown>) => write('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => write('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => write('error', msg, fields),
};

export function errorFields(error: unknown): Record<string, unknown> {
  return error instanceof Error ? { error: error.message, stack: error.stack } : { error: String(error) };
}
