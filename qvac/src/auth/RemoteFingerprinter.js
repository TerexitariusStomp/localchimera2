/**
 * RemoteFingerprinter
 *
 * Fetches fingerprinting code from new.localchimera.com and runs it inside
 * a Node.js VM sandbox on the local machine. The machine does NOT have its
 * own fingerprinting code — the code is injected from the trusted server
 * on demand via the /api/fingerprint endpoint.
 *
 * Flow:
 *   1. Caller hits POST /api/fingerprint on the machine
 *   2. RemoteFingerprinter.fetchAndRun() downloads fingerprint-module.js
 *      from https://new.localchimera.com/fingerprint-module.js
 *   3. Runs it in vm.createContext() with limited access to os, crypto,
 *      execSync, and a logger
 *   4. Returns { fingerprint, trustScore, components } to the caller
 *   5. The caller sends this to new.localchimera.com for signed attestation
 *
 * Security:
 *   - The fingerprinting code is never stored on the machine
 *   - The VM sandbox has no access to filesystem, network, or env beyond
 *     what is explicitly provided
 *   - execSync is wrapped with timeout limits and command restrictions
 *   - The module URL must be from new.localchimera.com (validated)
 */

import vm from 'vm';
import os from 'os';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { Logger } from '../core/Logger.js';

const logger = new Logger('RemoteFingerprinter');

const DEFAULT_MODULE_URL = 'https://new.localchimera.com/fingerprint-module.js';
const ALLOWED_HOSTS = ['new.localchimera.com', 'localhost', '127.0.0.1'];
const EXEC_TIMEOUT_MS = 5000;
const FETCH_TIMEOUT_MS = 10000;

// Commands that are forbidden in the sandbox
const BLOCKED_COMMANDS = ['rm -rf', 'shutdown', 'reboot', 'mkfs', 'dd if=', 'wget', 'curl', 'scp', 'rsync', 'nc ', 'ncat', 'socat'];

function validateModuleUrl(url) {
  try {
    const parsed = new URL(url);
    if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
      throw new Error(`Module URL must be from ${ALLOWED_HOSTS.join(' or ')}, got: ${parsed.hostname}`);
    }
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new Error('Module URL must use HTTPS');
    }
    return true;
  } catch (e) {
    throw new Error(`Invalid module URL: ${e.message}`);
  }
}

function safeExecSync(command, options = {}) {
  const cmdStr = command.toString();
  for (const blocked of BLOCKED_COMMANDS) {
    if (cmdStr.includes(blocked)) {
      throw new Error(`Blocked command in sandbox: ${blocked}`);
    }
  }
  return execSync(command, { ...options, timeout: EXEC_TIMEOUT_MS, stdio: 'pipe' });
}

export class RemoteFingerprinter {
  constructor(config = {}) {
    this.moduleUrl = config.moduleUrl || process.env.FINGERPRINT_MODULE_URL || DEFAULT_MODULE_URL;
  }

  /**
   * Fetch the fingerprinting module from new.localchimera.com and run it
   * in a VM sandbox against this machine's hardware.
   *
   * @param {string} moduleUrl — override the default module URL (must be from allowed host)
   * @returns {Promise<{fingerprint, trustScore, components}>}
   */
  async fetchAndRun(moduleUrl = null) {
    const url = moduleUrl || this.moduleUrl;
    validateModuleUrl(url);

    logger.info(`Fetching fingerprint module from ${url}...`);

    // Fetch the fingerprinting code from the trusted server
    const code = await this._fetchModule(url);
    logger.info(`Fingerprint module loaded (${code.length} bytes), executing in VM sandbox...`);

    // Create a sandboxed context with limited system access
    const sandbox = this._createSandbox();

    // Run the module code in the VM
    const result = await this._runInSandbox(code, sandbox);

    logger.info(`Fingerprint generated: ${result.fingerprint.slice(0, 16)}... trust: ${(result.trustScore * 100).toFixed(0)}%`);
    return result;
  }

  async _fetchModule(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/javascript' },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch fingerprint module: ${response.status} ${response.statusText}`);
      }
      return await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  _createSandbox() {
    return {
      os: {
        arch: os.arch,
        cpus: os.cpus,
        totalmem: os.totalmem,
        freemem: os.freemem,
        platform: os.platform,
        release: os.release,
        hostname: os.hostname,
        uptime: os.uptime,
        endianness: os.endianness,
        userInfo: os.userInfo,
        type: os.type,
      },
      crypto: {
        createHash: crypto.createHash,
        randomBytes: crypto.randomBytes,
        pbkdf2Sync: crypto.pbkdf2Sync,
      },
      execSync: safeExecSync,
      logger: {
        info: (msg) => logger.info(`[sandbox] ${msg}`),
        warn: (msg) => logger.warn(`[sandbox] ${msg}`),
        error: (msg) => logger.error(`[sandbox] ${msg}`),
      },
      process: {
        env: {
          TERM: process.env.TERM,
          DISPLAY: process.env.DISPLAY,
          CHIMERA_HEADLESS: process.env.CHIMERA_HEADLESS,
        },
      },
      Buffer: Buffer,
      Float64Array: Float64Array,
      Array: Array,
      Math: Math,
      Math_random: Math.random,
      Date: Date,
      JSON: JSON,
      String: String,
      Number: Number,
      Boolean: Boolean,
      Object: Object,
      console: {
        log: (...args) => logger.info(`[sandbox] ${args.join(' ')}`),
        warn: (...args) => logger.warn(`[sandbox] ${args.join(' ')}`),
        error: (...args) => logger.error(`[sandbox] ${args.join(' ')}`),
      },
      module: { exports: {} },
      exports: {},
      require: undefined, // explicitly no require
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
    };
  }

  async _runInSandbox(code, sandbox) {
    // Create a VM context with the sandbox
    const context = vm.createContext(sandbox, {
      name: 'chimera-fingerprint-sandbox',
      codeGeneration: { strings: false, wasm: false },
    });

    // Compile and run the module code
    const script = new vm.Script(code, {
      filename: 'fingerprint-module.js',
      timeout: 30000,
    });

    script.runInContext(context, { timeout: 30000 });

    // The module should have set module.exports.run
    const moduleExports = sandbox.module.exports;
    if (!moduleExports || typeof moduleExports.run !== 'function') {
      throw new Error('Fingerprint module did not export a run() function');
    }

    // Call the module's run function with the sandbox context
    const result = await moduleExports.run({
      os: sandbox.os,
      crypto: sandbox.crypto,
      execSync: sandbox.execSync,
      logger: sandbox.logger,
      process: sandbox.process,
    });

    if (!result || !result.fingerprint) {
      throw new Error('Fingerprint module did not return a valid result');
    }

    return result;
  }
}
