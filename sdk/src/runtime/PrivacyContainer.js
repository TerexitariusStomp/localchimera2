/**
 * PrivacyContainer — Docker-based runtime that runs the Chimera tasking network
 * providers inside an isolated container so the host machine identity is not visible.
 *
 * SINGLE CONTAINER GUARANTEE:
 *   This is the only Docker container. CHIMERA_PRIVACY_MODE=true is set inside
 *   the container so all providers switch to inline binary mode — no Docker-in-Docker.
 *   Provider binaries (yagna, myst, anyone-relay, btfs, miner-cli) are
 *   pre-installed in the Dockerfile and run as processes inside this single container.
 *
 * Privacy flags applied to every container:
 *   - Random hostname and MAC address
 *   - No host networking (bridge mode)
 *   - No new privileges
 *   - All capabilities dropped
 *   - Named volumes for data (no host bind mounts)
 *   - Config mounted read-only
 *   - CHIMERA_PRIVACY_MODE=true passed to the container
 */

import { spawn, execSync } from 'child_process';
import crypto from 'crypto';
import os from 'os';
import path from 'path';
import { promises as fs } from 'fs';
import { Logger } from '../core/Logger.js';

export class PrivacyContainer {
  constructor(opts = {}) {
    this.appName = opts.appName || 'sdk';
    this.image = opts.image || process.env.CHIMERA_IMAGE || 'chimera:latest';
    this.containerName = opts.containerName || this._makeContainerName(this.appName);
    this.hostPort = opts.hostPort || Number(process.env.CHIMERA_PORT) || 3002;
    this.containerPort = opts.containerPort || 3002;
    this.configPath = opts.configPath || null;
    this.dataVolume = opts.dataVolume || this._makeVolumeName('data');
    this.nodeDataVolume = opts.nodeDataVolume || this._makeVolumeName('nodedata');
    this.logger = new Logger('PrivacyContainer');
    this.process = null;
    this.running = false;
    this.appUrl = null;
  }

  _makeContainerName(appName) {
    const safe = String(appName).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32) || 'sdk';
    return `chimera-${safe}-${this._randomHex(8)}`;
  }

  _makeVolumeName(suffix) {
    const safe = String(this.appName).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32) || 'sdk';
    return `chimera-${safe}-${suffix}`;
  }

  _randomHex(len) {
    return crypto.randomBytes(Math.ceil(len / 2)).toString('hex').slice(0, len);
  }

  _randomMac() {
    const bytes = crypto.randomBytes(6);
    // Set locally-administered bit and unicast bit
    bytes[0] = (bytes[0] & 0xfc) | 0x02;
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(':');
  }

  static dockerAvailable() {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  async prepare() {
    if (!PrivacyContainer.dockerAvailable()) {
      throw new Error('Docker is not available on this machine');
    }
    if (this.configPath) {
      const configDir = path.join(os.homedir(), '.chimera', 'containers', this.containerName);
      await fs.mkdir(configDir, { recursive: true });
      const containerConfig = path.join(configDir, 'config.json');
      const raw = await fs.readFile(this.configPath, 'utf-8');
      await fs.writeFile(containerConfig, raw, 'utf-8');
      this.configPath = containerConfig;
    }
  }

  async start() {
    if (this.running) {
      return { success: true, alreadyRunning: true, appUrl: this.appUrl };
    }

    await this.prepare();
    this.logger.info(`Starting privacy container ${this.containerName}...`);

    // Remove any stale container with the same name
    try {
      execSync(`docker rm -f ${this.containerName}`, { stdio: 'ignore' });
    } catch {}

    const args = [
      'run', '-d',
      '--name', this.containerName,
      '--hostname', `chimera-${this._randomHex(8)}`,
      '--mac-address', this._randomMac(),
      '--network', 'bridge',
      '--security-opt', 'no-new-privileges:true',
      '--cap-drop', 'ALL',
      '-p', `${this.hostPort}:${this.containerPort}`,
      '-v', `${this.dataVolume}:/app/data`,
      '-v', `${this.nodeDataVolume}:/app/node-data`,
      '-e', 'CHIMERA_PRIVACY_MODE=true',
      '-e', `PORT=${this.containerPort}`,
    ];

    if (this.configPath) {
      args.push('-v', `${this.configPath}:/app/config.json:ro`);
    }

    args.push(this.image);

    return new Promise((resolve, reject) => {
      this.process = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      this.process.stderr.on('data', (data) => {
        stderr += data;
        this.logger.warn(data.toString().trim());
      });
      this.process.on('exit', (code) => {
        if (code !== 0) {
          this.running = false;
          reject(new Error(`docker run failed: ${stderr || `exit ${code}`}`));
        }
      });

      // Wait briefly for the container to start, then poll for health
      setTimeout(() => this._waitForHealth(60, resolve, reject), 2000);
    });
  }

  async _waitForHealth(retries, resolve, reject) {
    const url = `http://localhost:${this.hostPort}/api/status`;
    for (let i = 0; i < retries; i++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          this.running = true;
          this.appUrl = `http://localhost:${this.hostPort}`;
          this.logger.info(`Container healthy at ${this.appUrl}`);
          resolve({ success: true, containerName: this.containerName, appUrl: this.appUrl });
          return;
        }
      } catch (e) {
        // container not ready yet
      }
      await new Promise(r => setTimeout(r, 2000));
    }
    this.running = false;
    reject(new Error(`Privacy container ${this.containerName} did not become healthy`));
  }

  async stop() {
    if (!this.containerName) return { success: true };
    this.logger.info(`Stopping privacy container ${this.containerName}...`);
    try {
      execSync(`docker stop -t 10 ${this.containerName}`, { stdio: 'ignore' });
    } catch {}
    try {
      execSync(`docker rm -f ${this.containerName}`, { stdio: 'ignore' });
    } catch {}
    this.running = false;
    this.appUrl = null;
    return { success: true, containerName: this.containerName };
  }

  isRunning() {
    return this.running;
  }

  status() {
    return {
      containerized: true,
      running: this.running,
      containerName: this.containerName,
      appUrl: this.appUrl,
      image: this.image,
      hostPort: this.hostPort,
    };
  }

  async apiStart(payload = {}) {
    if (!this.appUrl) throw new Error('Container not running');
    const res = await fetch(`${this.appUrl}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  async apiStop() {
    if (!this.appUrl) throw new Error('Container not running');
    const res = await fetch(`${this.appUrl}/api/stop`, { method: 'POST' });
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }

  async apiStatus() {
    if (!this.appUrl) throw new Error('Container not running');
    const res = await fetch(`${this.appUrl}/api/status`);
    const text = await res.text();
    return text ? JSON.parse(text) : {};
  }
}
