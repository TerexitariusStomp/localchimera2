/**
 * BtfsProvider — Auto-setup and run BTFS storage node.
 *
 * Consumer-friendly decentralized storage from BitTorrent.
 * Works on CPU-only machines with moderate storage.
 */

import { spawn } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const BTFS_DIR = path.join(os.homedir(), 'CascadeProjects', 'qvac-chimera', 'upstream', 'btfs');
const BTFS_BINARY = path.join(BTFS_DIR, 'btfs');
const BTFS_REPO = path.join(os.homedir(), '.btfs');

export class BtfsProvider {
  constructor(opts = {}) {
    this.process = null;
    this.running = false;
    this.logs = [];
    this.storageMax = opts.storageMax || '50GB'; // consumer-friendly default
    this.apiPort = opts.apiPort || 5001;
    this.gatewayPort = opts.gatewayPort || 8080;
  }

  async init() {
    const exists = await fs.access(BTFS_BINARY).then(() => true).catch(() => false);
    if (!exists) throw new Error('BTFS binary not found. Build with: cd upstream/btfs && go build -o btfs ./cmd/btfs');

    // Ensure repo dir exists
    await fs.mkdir(BTFS_REPO, { recursive: true });
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    return new Promise((resolve) => {
      const env = {
        ...process.env,
        BTFS_PATH: BTFS_REPO
      };

      this.process = spawn(BTFS_BINARY, [
        'daemon',
        '--enable-storage-host',
        '--storage-max', this.storageMax,
        '--api-addr', `/ip4/127.0.0.1/tcp/${this.apiPort}`
      ], { env, detached: true });

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
          resolve({ success: true, pid: this.process.pid, provider: 'btfs' });
        } else {
          resolve({ success: false, error: 'BTFS exited immediately. Check logs.' });
        }
      }, 5000);
    });
  }

  async stop() {
    if (!this.process || !this.running) return { success: true, alreadyStopped: true };
    this.process.kill('SIGTERM');
    this.running = false;
    return { success: true, provider: 'btfs' };
  }

  status() {
    return {
      provider: 'btfs',
      running: this.running,
      pid: this.process?.pid || null,
      storageMax: this.storageMax,
      apiPort: this.apiPort,
      resources: 'CPU only, consumer-friendly',
      recentLogs: this.logs.slice(-10)
    };
  }
}
