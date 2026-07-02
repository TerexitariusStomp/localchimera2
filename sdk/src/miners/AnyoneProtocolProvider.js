/**
 * AnyoneProtocolProvider — Auto-setup and run Anyone Protocol relay.
 *
 * Onion routing relay node (DePIN). Earns $ANYONE tokens on Ethereum based
 * on bandwidth, uptime, and geolocation. Rewards are claimed via the Anyone
 * dashboard (dashboard.anyone.io) tied to the relay's Ethereum address.
 *
 * In the Chimera SDK, the relay uses the protocol multisig EVM address.
 * Individual Privy wallets receive funds via the monthly sweep.
 *
 * Two modes:
 *   - Host mode (default): spawns `docker run anyoneprotocol/relay:latest`
 *   - Container mode (CHIMERA_PRIVACY_MODE=true): runs `anyone-relay` binary
 *     directly inside the single Chimera container. The binary must be
 *     pre-installed in the Dockerfile.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const ANYONE_DIR = process.env.CHIMERA_ANYONE_DIR || path.join(os.homedir(), '.chimera', 'upstream', 'anyone-protocol');

export class AnyoneProtocolProvider {
  constructor(opts = {}) {
    this.process = null;
    this.running = false;
    this.logs = [];
    this.relayPort = opts.relayPort || 9001;
    this.evmAddress = opts.evmAddress || null;  // Protocol multisig for $ANYONE rewards
  }

  async init() {
    this.inContainer = process.env.CHIMERA_PRIVACY_MODE === 'true';

    if (this.inContainer) {
      try {
        execSync('which anyone-relay', { stdio: 'ignore' });
      } catch {
        throw new Error('anyone-relay binary not found in container. Install in Dockerfile.');
      }
      return;
    }

    const exists = await fs.access(ANYONE_DIR).then(() => true).catch(() => false);
    if (!exists) throw new Error('Anyone Protocol not found. Clone: git submodule add https://github.com/anyone-protocol/anyone.git upstream/anyone-protocol');

    try {
      execSync('docker --version', { stdio: 'ignore' });
    } catch {
      throw new Error('Docker not available. Install Docker first.');
    }
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    return new Promise((resolve) => {
      if (this.inContainer) {
        const args = ['--port', String(this.relayPort)];
        if (this.evmAddress) {
          args.push('--reward-address', this.evmAddress);
        }
        this.process = spawn('anyone-relay', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      } else {
        const dockerArgs = [
          'run', '-d',
          '--name', 'anyone-relay',
          '--restart', 'unless-stopped',
          '-p', `${this.relayPort}:9001`,
          '-v', path.join(ANYONE_DIR, 'config') + ':/app/config',
        ];
        if (this.evmAddress) {
          dockerArgs.push('-e', `ANYONE_REWARD_ADDRESS=${this.evmAddress}`);
        }
        dockerArgs.push('anyoneprotocol/relay:latest');
        this.process = spawn('docker', dockerArgs, { cwd: ANYONE_DIR });
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
          resolve({ success: true, pid: this.process.pid, provider: 'anyone-protocol', relayPort: this.relayPort, mode: this.inContainer ? 'inline' : 'docker' });
        } else {
          resolve({ success: false, error: 'Anyone Protocol relay exited immediately. Check logs.' });
        }
      }, 5000);
    });
  }

  async stop() {
    if (!this.process || !this.running) return { success: true, alreadyStopped: true };
    if (!this.inContainer) {
      try {
        execSync('docker stop anyone-relay', { stdio: 'ignore' });
        execSync('docker rm anyone-relay', { stdio: 'ignore' });
      } catch {}
    }
    this.process.kill('SIGTERM');
    this.running = false;
    return { success: true, provider: 'anyone-protocol' };
  }

  status() {
    return {
      provider: 'anyone-protocol',
      running: this.running,
      pid: this.process?.pid || null,
      relayPort: this.relayPort,
      rewardAddress: this.evmAddress || null,
      rewardToken: 'ANYONE',
      rewardChain: 'ethereum',
      payoutModel: 'protocol-multisig-monthly-sweep',
      resources: this.inContainer ? 'Inline (container), bandwidth + CPU' : 'Docker-based, bandwidth + CPU',
      recentLogs: this.logs.slice(-10)
    };
  }
}
