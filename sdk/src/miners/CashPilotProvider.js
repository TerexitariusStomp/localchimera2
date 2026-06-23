/**
 * CashPilotProvider — Auto-setup and run GeiserX CashPilot.
 *
 * Python/Django web UI + worker for managing DePIN services.
 * Consumer-friendly: two-container Docker setup, no GPU needed.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';

const CP_DIR = path.join(os.homedir(), 'CascadeProjects', 'qvac-chimera', 'upstream', 'cashpilot');

export class CashPilotProvider {
  constructor(opts = {}) {
    this.process = null;
    this.running = false;
    this.logs = [];
    this.apiKey = opts.apiKey || '';
    this.adminKey = opts.adminKey || '';
  }

  async init() {
    const exists = await fs.access(CP_DIR).then(() => true).catch(() => false);
    if (!exists) throw new Error('CashPilot not found. Clone: git submodule add https://github.com/GeiserX/CashPilot.git upstream/cashpilot');

    try {
      execSync('docker compose version', { stdio: 'ignore' });
    } catch {
      throw new Error('Docker Compose not available. Install Docker first.');
    }
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    return new Promise((resolve) => {
      const env = {
        ...process.env,
        CASHPILOT_API_KEY: this.apiKey,
        CASHPILOT_ADMIN_API_KEY: this.adminKey,
        TZ: process.env.TZ || 'UTC'
      };

      this.process = spawn('docker', ['compose', 'up', '-d'], { cwd: CP_DIR, env });

      let stdout = '';
      let stderr = '';

      this.process.stdout.on('data', (data) => { stdout += data.toString(); });
      this.process.stderr.on('data', (data) => { stderr += data.toString(); });

      this.process.on('close', (code) => {
        if (code === 0) {
          this.running = true;
          resolve({ success: true, provider: 'cashpilot', mode: 'docker-compose', ui: 'http://localhost:8080' });
        } else {
          resolve({ success: false, provider: 'cashpilot', error: stderr || stdout });
        }
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      const proc = spawn('docker', ['compose', 'down'], { cwd: CP_DIR });
      proc.on('close', (code) => {
        this.running = false;
        resolve({ success: code === 0, provider: 'cashpilot' });
      });
    });
  }

  status() {
    try {
      const output = execSync('docker compose ps --format json', { encoding: 'utf-8', cwd: CP_DIR });
      const containers = JSON.parse(output);
      return {
        provider: 'cashpilot',
        running: this.running,
        containers: containers.length,
        ui: 'http://localhost:8080',
        resources: 'Docker-based, consumer-friendly',
        mode: 'docker-compose'
      };
    } catch {
      return {
        provider: 'cashpilot',
        running: this.running,
        containers: 0,
        ui: 'http://localhost:8080',
        resources: 'Docker-based, consumer-friendly',
        mode: 'docker-compose'
      };
    }
  }
}
