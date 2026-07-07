/**
 * GolemProvider — Auto-setup and run Golem provider node.
 *
 * Decentralized compute marketplace (yagna daemon).
 * No local private keys in SDK.
 *
 * Two modes:
 *   - Host mode (default): spawns `docker run golemprovider/golem-provider:latest`
 *   - Container mode (CHIMERA_PRIVACY_MODE=true): runs `yagna` binary directly
 *     inside the single Chimera container. The binary must be pre-installed
 *     in the Dockerfile.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { getProtocolPayoutAddress } from './protocol-address.js';

const GOLEM_DIR = process.env.CHIMERA_GOLEM_DIR || path.join(os.homedir(), '.chimera', 'upstream', 'golem');

export class GolemProvider {
  constructor(opts = {}) {
    this.process = null;
    this.running = false;
    this.logs = [];
    this.subnet = opts.subnet || 'public';
    this.payoutAddress = getProtocolPayoutAddress(opts); // Protocol address for GLM earnings; yagna wallet is managed separately
  }

  async init() {
    this.inContainer = process.env.CHIMERA_PRIVACY_MODE === 'true';

    if (this.inContainer) {
      try {
        execSync('which yagna', { stdio: 'ignore' });
      } catch {
        throw new Error('yagna binary not found in container. Install in Dockerfile.');
      }
      this.dataDir = path.join(os.homedir(), '.local', 'share', 'yagna');
      await fs.mkdir(this.dataDir, { recursive: true });
      return;
    }

    const exists = await fs.access(GOLEM_DIR).then(() => true).catch(() => false);
    if (!exists) throw new Error('Golem provider not found. Clone: git submodule add https://github.com/golemcloud/golem-runner.git upstream/golem');

    try {
      execSync('docker --version', { stdio: 'ignore' });
    } catch {
      throw new Error('Docker not available. Install Docker first.');
    }
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    return new Promise((resolve) => {
      const env = { ...process.env, GOLEM_SUBNET: this.subnet };

      if (this.inContainer) {
        this.process = spawn('yagna', ['service', 'run'], {
          cwd: this.dataDir,
          env,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } else {
        this.process = spawn('docker', [
          'run', '-d',
          '--name', 'golem-provider',
          '--restart', 'unless-stopped',
          '-e', `GOLEM_SUBNET=${this.subnet}`,
          '-v', '/var/run/docker.sock:/var/run/docker.sock',
          '-v', path.join(GOLEM_DIR, 'data') + ':/root/.local/share/yagna',
          'golemprovider/golem-provider:latest'
        ], { cwd: GOLEM_DIR });
      }

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
          resolve({ success: true, pid: this.process.pid, provider: 'golem', subnet: this.subnet, mode: this.inContainer ? 'inline' : 'docker' });
        } else {
          resolve({ success: false, error: 'Golem provider exited immediately. Check logs.' });
        }
      }, 5000);
    });
  }

  async stop() {
    if (!this.process || !this.running) return { success: true, alreadyStopped: true };
    if (!this.inContainer) {
      try {
        execSync('docker stop golem-provider', { stdio: 'ignore' });
        execSync('docker rm golem-provider', { stdio: 'ignore' });
      } catch {}
    }
    this.process.kill('SIGTERM');
    this.running = false;
    return { success: true, provider: 'golem' };
  }

  status() {
    return {
      provider: 'golem',
      running: this.running,
      pid: this.process?.pid || null,
      subnet: this.subnet,
      payoutAddress: this.payoutAddress,
      resources: this.inContainer ? 'Inline (container), CPU + optional GPU' : 'Docker-based, CPU + optional GPU',
      recentLogs: this.logs.slice(-10)
    };
  }
}
