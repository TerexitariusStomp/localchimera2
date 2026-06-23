/**
 * SiaProvider — Auto-setup and run Sia hostd storage node.
 *
 * Provides storage on the Sia network.
 * Moderate requirements: 8 GB RAM, 4 TB+ storage recommended.
 */

import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const SIA_DIR = path.join(os.homedir(), 'CascadeProjects', 'qvac-chimera', 'upstream', 'sia-hostd');
const SIA_BINARY = path.join(SIA_DIR, 'hostd');
const SIA_DATA = path.join(os.homedir(), '.sia-hostd');

export class SiaProvider {
  constructor(opts = {}) {
    this.process = null;
    this.running = false;
    this.logs = [];
    this.dataDir = opts.dataDir || SIA_DATA;
    this.storagePath = opts.storagePath || path.join(os.homedir(), 'sia-storage');
    this.httpPort = opts.httpPort || 9980;
    this.rhpPort = opts.rhpPort || 9981;
  }

  async init() {
    const exists = await fs.access(SIA_BINARY).then(() => true).catch(() => false);
    if (!exists) throw new Error('Sia hostd binary not found. Build with: cd upstream/sia-hostd && GOTOOLCHAIN=auto go build -o hostd ./cmd/hostd');

    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.storagePath, { recursive: true });
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    return new Promise((resolve) => {
      this.process = spawn(SIA_BINARY, [
        '--dir', this.dataDir,
        '--http', `localhost:${this.httpPort}`,
        '--rhp4', `:${this.rhpPort}`
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
          resolve({ success: true, pid: this.process.pid, provider: 'sia' });
        } else {
          resolve({ success: false, error: 'Sia hostd exited immediately. Check logs.' });
        }
      }, 5000);
    });
  }

  async stop() {
    if (!this.process || !this.running) return { success: true, alreadyStopped: true };
    this.process.kill('SIGTERM');
    this.running = false;
    return { success: true, provider: 'sia' };
  }

  status() {
    return {
      provider: 'sia',
      running: this.running,
      pid: this.process?.pid || null,
      dataDir: this.dataDir,
      storagePath: this.storagePath,
      httpPort: this.httpPort,
      rhpPort: this.rhpPort,
      resources: 'CPU only, moderate storage required',
      recentLogs: this.logs.slice(-10)
    };
  }
}
