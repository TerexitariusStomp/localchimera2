/**
 * ZcnProvider — Auto-setup and run 0Chain Blobber storage node.
 *
 * Storage provider for the Züs (0Chain) decentralized storage network.
 * Lightweight, no GPU required.
 */

import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const ZCN_DIR = path.join(os.homedir(), 'CascadeProjects', 'qvac-chimera', 'upstream', 'zcn-blobber');
const ZCN_BINARY = path.join(ZCN_DIR, 'blobber');
const ZCN_CONFIG = path.join(os.homedir(), '.zcn');

export class ZcnProvider {
  constructor(opts = {}) {
    this.process = null;
    this.running = false;
    this.logs = [];
    this.configDir = opts.configDir || ZCN_CONFIG;
    this.port = opts.port || 5050;
  }

  async init() {
    const exists = await fs.access(ZCN_BINARY).then(() => true).catch(() => false);
    if (!exists) throw new Error('0Chain blobber binary not found. Build with: cd upstream/zcn-blobber/code/go/0chain.net/blobber && go build -o ../../../blobber .');

    await fs.mkdir(this.configDir, { recursive: true });
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    return new Promise((resolve) => {
      this.process = spawn(ZCN_BINARY, [
        '--port', String(this.port),
        '--configDir', this.configDir
      ], { detached: true });

      this.running = true;

      this.process.stdout.on('data', (data) => {
        const line = data.toString().trim();
        this.logs.push({ ts: Date.now(), level: 'info', msg: line });
        if (this.logs.length > 500) this.logs.shift();
      });

      this.process.stderr.on('data', (data) => {
        const line = data.toString().trim();
        this.logs.push({ ts: Date.now(), level: 'error', msg: line });
        if (this.logs.length > 500) this.logs.shift();
      });

      this.process.on('exit', (code) => {
        this.running = false;
      });

      setTimeout(() => {
        if (this.process && !this.process.killed) {
          resolve({ success: true, pid: this.process.pid, provider: 'zcn' });
        } else {
          resolve({ success: false, error: '0Chain blobber exited immediately. Check logs.' });
        }
      }, 5000);
    });
  }

  async stop() {
    if (!this.process || !this.running) return { success: true, alreadyStopped: true };
    this.process.kill('SIGTERM');
    this.running = false;
    return { success: true, provider: 'zcn' };
  }

  status() {
    return {
      provider: 'zcn',
      running: this.running,
      pid: this.process?.pid || null,
      configDir: this.configDir,
      port: this.port,
      resources: 'CPU only, lightweight',
      recentLogs: this.logs.slice(-10)
    };
  }
}
