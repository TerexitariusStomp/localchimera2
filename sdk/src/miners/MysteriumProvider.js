/**
 * MysteriumProvider — Auto-setup and run Mysterium VPN node.
 *
 * Decentralized VPN node (Mysterium Network).
 * No keys required in SDK.
 *
 * Two modes:
 *   - Host mode (default): spawns `docker run mysteriumnetwork/myst:latest`
 *   - Container mode (CHIMERA_PRIVACY_MODE=true): runs `myst` binary directly
 *     inside the single Chimera container. The binary must be pre-installed
 *     in the Dockerfile.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const MYSTERIUM_DIR = process.env.CHIMERA_MYSTERIUM_DIR || path.join(os.homedir(), '.chimera', 'upstream', 'mysterium');

export class MysteriumProvider {
  constructor(opts = {}) {
    this.process = null;
    this.running = false;
    this.logs = [];
    this.dataDir = opts.dataDir || path.join(os.homedir(), '.mysterium');
    this.agreedTerms = opts.agreedTerms || true;
  }

  async init() {
    this.inContainer = process.env.CHIMERA_PRIVACY_MODE === 'true';

    if (this.inContainer) {
      try {
        execSync('which myst', { stdio: 'ignore' });
      } catch {
        throw new Error('myst binary not found in container. Install in Dockerfile.');
      }
      await fs.mkdir(this.dataDir, { recursive: true });
      return;
    }

    const exists = await fs.access(MYSTERIUM_DIR).then(() => true).catch(() => false);
    if (!exists) throw new Error('Mysterium node not found. Clone: git submodule add https://github.com/mysteriumnetwork/node.git upstream/mysterium');

    try {
      execSync('docker --version', { stdio: 'ignore' });
    } catch {
      throw new Error('Docker not available. Install Docker first.');
    }

    await fs.mkdir(this.dataDir, { recursive: true });
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    return new Promise((resolve) => {
      const env = { ...process.env };

      if (this.inContainer) {
        this.process = spawn('myst', [
          'service', '--agreed-terms-and-conditions',
          '--data-dir', this.dataDir,
        ], { env, stdio: ['ignore', 'pipe', 'pipe'] });
      } else {
        this.process = spawn('docker', [
          'run', '-d',
          '--name', 'mysterium-node',
          '--restart', 'unless-stopped',
          '--cap-add', 'NET_ADMIN',
          '-p', '5252:5252',
          '-v', `${this.dataDir}:/var/lib/mysterium-node`,
          'mysteriumnetwork/myst:latest',
          'service', '--agreed-terms-and-conditions'
        ], { cwd: MYSTERIUM_DIR, env });
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
          resolve({ success: true, pid: this.process.pid, provider: 'mysterium', mode: this.inContainer ? 'inline' : 'docker' });
        } else {
          resolve({ success: false, error: 'Mysterium node exited immediately. Check logs.' });
        }
      }, 5000);
    });
  }

  async stop() {
    if (!this.process || !this.running) return { success: true, alreadyStopped: true };
    if (!this.inContainer) {
      try {
        execSync('docker stop mysterium-node', { stdio: 'ignore' });
        execSync('docker rm mysterium-node', { stdio: 'ignore' });
      } catch {}
    }
    this.process.kill('SIGTERM');
    this.running = false;
    return { success: true, provider: 'mysterium' };
  }

  status() {
    return {
      provider: 'mysterium',
      running: this.running,
      pid: this.process?.pid || null,
      dataDir: this.dataDir,
      resources: this.inContainer ? 'Inline (container), bandwidth (VPN relay)' : 'Docker-based, bandwidth (VPN relay)',
      recentLogs: this.logs.slice(-10)
    };
  }
}
