/**
 * IncomeGeneratorProvider — Auto-setup and run XternA Income Generator.
 *
 * Docker-based bandwidth sharing orchestrator.
 * Consumer-friendly: works on Raspberry Pi 3+, needs only Docker + bandwidth.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const IG_DIR = path.join(os.homedir(), 'CascadeProjects', 'qvac-chimera', 'upstream', 'income-generator');

export class IncomeGeneratorProvider {
  constructor(opts = {}) {
    this.process = null;
    this.running = false;
    this.logs = [];
    this.composeFile = opts.composeFile || 'compose/compose.yml';
  }

  async init() {
    const exists = await fs.access(IG_DIR).then(() => true).catch(() => false);
    if (!exists) throw new Error('Income Generator not found. Clone: git submodule add https://github.com/XternA/income-generator.git upstream/income-generator');

    // Check Docker is available
    try {
      execSync('docker compose version', { stdio: 'ignore' });
    } catch {
      throw new Error('Docker Compose not available. Install Docker first.');
    }
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    return new Promise((resolve) => {
      this.process = spawn('docker', [
        'compose',
        '-f', path.join(IG_DIR, this.composeFile),
        'up', '-d'
      ], { cwd: IG_DIR });

      let stdout = '';
      let stderr = '';

      this.process.stdout.on('data', (data) => { stdout += data.toString(); });
      this.process.stderr.on('data', (data) => { stderr += data.toString(); });

      this.process.on('close', (code) => {
        if (code === 0) {
          this.running = true;
          resolve({ success: true, provider: 'income-generator', mode: 'docker-compose' });
        } else {
          resolve({ success: false, provider: 'income-generator', error: stderr || stdout });
        }
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      const proc = spawn('docker', [
        'compose',
        '-f', path.join(IG_DIR, this.composeFile),
        'down'
      ], { cwd: IG_DIR });

      proc.on('close', (code) => {
        this.running = false;
        resolve({ success: code === 0, provider: 'income-generator' });
      });
    });
  }

  status() {
    try {
      const output = execSync('docker compose -f ' + path.join(IG_DIR, this.composeFile) + ' ps --format json', { encoding: 'utf-8', cwd: IG_DIR });
      const containers = JSON.parse(output);
      return {
        provider: 'income-generator',
        running: this.running,
        containers: containers.length,
        resources: 'Bandwidth only, consumer-friendly (Raspberry Pi compatible)',
        mode: 'docker-compose'
      };
    } catch {
      return {
        provider: 'income-generator',
        running: this.running,
        containers: 0,
        resources: 'Bandwidth only, consumer-friendly (Raspberry Pi compatible)',
        mode: 'docker-compose'
      };
    }
  }
}
