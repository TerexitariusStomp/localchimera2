/**
 * BttAiMinerProvider — Auto-setup and run BTT AI Labs miner-cli.
 *
 * GPU-based AI inference miner for vLLM/SGLang tasking networks.
 * Requires NVIDIA GPU.
 *
 * Two modes:
 *   - Host mode (default): requires Docker + NVIDIA Container Toolkit for vLLM
 *   - Container mode (CHIMERA_PRIVACY_MODE=true): runs `miner-cli` directly.
 *     The binary and GPU drivers must be pre-installed in the Dockerfile.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const BTT_DIR = process.env.CHIMERA_BTT_DIR || path.join(os.homedir(), '.chimera', 'upstream', 'btt-ai-miner');

export class BttAiMinerProvider {
  constructor(opts = {}) {
    this.process = null;
    this.running = false;
    this.logs = [];
    this.engine = opts.engine || 'vllm'; // or 'sglang'
    this.configFile = opts.configFile || path.join(BTT_DIR, 'miner.yaml');
  }

  async init() {
    this.inContainer = process.env.CHIMERA_PRIVACY_MODE === 'true';

    const exists = await fs.access(BTT_DIR).then(() => true).catch(() => false);
    if (!exists && !this.inContainer) throw new Error('BTT AI miner not found. Clone: git submodule add https://github.com/BTT-AI-labs/miner-cli.git upstream/btt-ai-miner');

    // Check for Python 3.10+
    try {
      const pyVer = execSync('python3 --version', { encoding: 'utf-8' }).trim();
      const major = parseInt(pyVer.split(' ')[1].split('.')[0]);
      const minor = parseInt(pyVer.split(' ')[1].split('.')[1]);
      if (major < 3 || (major === 3 && minor < 10)) {
        throw new Error(`Python 3.10+ required, found ${pyVer}`);
      }
    } catch {
      throw new Error('Python 3.10+ not available');
    }

    // In container mode, skip Docker check — miner-cli runs directly
    if (!this.inContainer) {
      try {
        execSync('docker --version', { stdio: 'ignore' });
      } catch {
        throw new Error('Docker not available');
      }
    }

    // Check for NVIDIA GPU
    try {
      execSync('nvidia-smi', { stdio: 'ignore' });
    } catch {
      throw new Error('NVIDIA GPU not detected. BTT AI miner requires GPU.');
    }

    // Install miner-cli if not already installed
    try {
      execSync('which miner-cli', { stdio: 'ignore' });
    } catch {
      // Install via pip/uv
      try {
        execSync('pip install -e .', { cwd: BTT_DIR, stdio: 'ignore' });
      } catch {
        throw new Error('Failed to install miner-cli. Run: cd upstream/btt-ai-miner && pip install -e .');
      }
    }
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    return new Promise((resolve) => {
      this.process = spawn('miner-cli', ['up', '-f', this.configFile], { cwd: BTT_DIR });

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
          resolve({ success: true, pid: this.process.pid, provider: 'btt-ai-miner', engine: this.engine });
        } else {
          resolve({ success: false, error: 'BTT AI miner exited immediately. Check logs.' });
        }
      }, 10000);
    });
  }

  async stop() {
    if (!this.process || !this.running) return { success: true, alreadyStopped: true };
    this.process.kill('SIGTERM');
    this.running = false;
    return { success: true, provider: 'btt-ai-miner' };
  }

  status() {
    return {
      provider: 'btt-ai-miner',
      running: this.running,
      pid: this.process?.pid || null,
      engine: this.engine,
      resources: this.inContainer ? 'Inline (container), GPU required (NVIDIA)' : 'GPU required (NVIDIA), Docker-based',
      recentLogs: this.logs.slice(-10)
    };
  }
}
