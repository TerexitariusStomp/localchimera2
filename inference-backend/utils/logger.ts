import pino from 'pino';
import { logConfig } from './config.js';

export const logger = pino({
  level: logConfig.level,
  transport:
    logConfig.format === 'pretty'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
  base: {
    service: 'chimera-fortytwo-node',
  },
});

export function createChildLogger(meta: Record<string, unknown>) {
  return logger.child(meta);
}
