import { startApp } from './app';
import { loadConfig } from './config';
import { errorFields, log } from './log';

const config = loadConfig();

process.on('unhandledRejection', (reason) => log.error('unhandled rejection', errorFields(reason)));
process.on('uncaughtException', (error) => log.error('uncaught exception', errorFields(error)));

const app = await startApp({
  port: config.port,
  webDist: config.production ? config.webDist : undefined,
  allowedOrigin: config.allowedOrigin,
  admin: config.admin,
  production: config.production,
  trustProxy: config.trustProxy,
  releasedGames: config.releasedGames,
});
log.info('server listening', { port: app.port, production: config.production, admin: config.admin !== undefined });
if (config.admin && config.production && config.admin.password.length < 12) {
  log.warn('ADMIN_PASSWORD is short; use 12+ characters in production');
}

const shutdown = (): void => {
  log.info('shutting down');
  void app.close().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
