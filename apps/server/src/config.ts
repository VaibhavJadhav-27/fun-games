import { fileURLToPath } from 'node:url';

export interface Config {
  port: number;
  production: boolean;
  allowedOrigin: string | undefined;
  webDist: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error(`Invalid PORT: ${env.PORT}`);
  return {
    port,
    production: env.NODE_ENV === 'production',
    allowedOrigin: env.ALLOWED_ORIGIN || undefined,
    webDist: env.WEB_DIST ?? fileURLToPath(new URL('../../web/dist', import.meta.url)),
  };
}
