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
});
log.info('server listening', { port: app.port, production: config.production });

const shutdown = (): void => {
  log.info('shutting down');
  void app.close().then(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
