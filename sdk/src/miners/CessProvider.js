/**
 * CessProvider — Auto-setup and run CESSProject storage node.
 *
 * Docker-based decentralized cloud storage node.
 * Consumer-friendly if Docker is available; needs port forwarding.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const CESS_DIR = path.join(os.homedir(), 'CascadeProjects', 'qvac-chimera', 'upstream', 'cess-nodeadm');

export class CessProvider {
  constructor(opts = {}) {
    this.process = null;
    this.running = false;
    this.logs = [];
    this.storagePath = opts.storagePath || path.join(os.homedir(), 'cess-storage');
  }

  async init() {
    const exists = await fs.access(CESS_DIR).then(() => true).catch(() => false);
    if (!exists) throw new Error('CESS nodeadm not found. Clone: git submodule add https://github.com/CESSProject/cess-nodeadm.git upstream/cess-nodeadm');

    try {
      execSync('docker compose version', { stdio: 'ignore' });
    } catch {
      throw new Error('Docker Compose not available. Install Docker first.');
    }

    await fs.mkdir(this.storagePath, { recursive: true });
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    return new Promise((resolve) => {
      const env = { ...process.env };

      this.process = spawn('bash', ['-c', 'sudo ./install.sh --skip-dep && sudo cess start'], { cwd: CESS_DIR, env });

      let stdout = '';
      let stderr = '';

      this.process.stdout.on('data', (data) => { stdout += data.toString(); });
      this.process.stderr.on('data', (data) => { stderr += data.toString(); });

      this.process.on('close', (code) => {
        if (code === 0) {
          this.running = true;
          resolve({ success: true, provider: 'cess', mode: 'docker', note: 'Uses sudo for CESS CLI' });
        } else {
          resolve({ success: false, provider: 'cess', error: stderr || stdout });
        }
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      const proc = spawn('bash', ['-c', 'sudo cess stop'], { cwd: CESS_DIR });
      proc.on('close', (code) => {
        this.running = false;
        resolve({ success: code === 0, provider: 'cess' });
      });
    });
  }

  status() {
    try {
      const output = execSync('sudo cess status', { encoding: 'utf-8', cwd: CESS_DIR });
      return {
        provider: 'cess',
        running: this.running,
        statusOutput: output.trim(),
        resources: 'Docker-based storage node, needs ports 30336/9944/19999/15001',
        mode: 'docker'
      };
    } catch {
      return {
        provider: 'cess',
        running: this.running,
        resources: 'Docker-based storage node, needs ports 30336/9944/19999/15001',
        mode: 'docker'
      };
    }
  }
}
