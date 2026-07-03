/**
 * Lightweight logger for @localchimera/sdk — no external dependencies.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const ENV_LEVEL = (typeof process !== 'undefined' && process.env?.CHIMERA_LOG_LEVEL) || 'info';
const THRESHOLD = LEVELS[ENV_LEVEL] ?? LEVELS.info;

function ts() {
  return new Date().toISOString().slice(11, 23);
}

export class Logger {
  constructor(tag = 'Chimera') {
    this.tag = tag;
  }

  debug(msg) {
    if (THRESHOLD <= LEVELS.debug) console.debug(`[${ts()}] [${this.tag}] DEBUG: ${msg}`);
  }

  info(msg) {
    if (THRESHOLD <= LEVELS.info) console.log(`[${ts()}] [${this.tag}] INFO: ${msg}`);
  }

  warn(msg) {
    if (THRESHOLD <= LEVELS.warn) console.warn(`[${ts()}] [${this.tag}] WARN: ${msg}`);
  }

  error(msg) {
    if (THRESHOLD <= LEVELS.error) console.error(`[${ts()}] [${this.tag}] ERROR: ${msg}`);
  }
}
