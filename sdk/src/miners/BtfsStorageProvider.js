/**
 * BtfsStorageProvider — Walletless decentralized storage provider for untrusted machines.
 *
 * Each provider runs a local go-btfs daemon. Files are stored on the BTFS
 * network, not on a central server. The provider only pins and serves files
 * that correspond to on-chain storage jobs it has accepted.
 *
 * Security / no-local-key guarantee:
 *   - The SDK never asks for, stores, or requires a BTT wallet mnemonic.
 *   - The BTFS daemon's wallet is unfunded and unused; BTT storage-host mode
 *     is disabled so the daemon never signs cheques or storage contracts.
 *   - The only key material on the provider is the libp2p peer identity
 *     needed to join the BTFS swarm. It does not hold funds.
 *   - All payments and job authorization are handled on the Casper blockchain.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { BtfsClient } from '../storage/BtfsClient.js';
import { Logger } from '../../qvac/src/core/Logger.js';

const logger = new Logger('BtfsStorageProvider');
const UPSTREAM_BTFS = path.resolve(os.homedir(), 'CascadeProjects', 'localchimera', 'upstream', 'btfs');
const DEFAULT_REPO = path.join(os.homedir(), '.btfs-chimera');

export class BtfsStorageProvider {
  constructor(opts = {}) {
    this.apiUrl = opts.apiUrl || 'http://127.0.0.1:5001';
    this.repoPath = opts.repoPath || DEFAULT_REPO;
    this.upstreamPath = opts.upstreamPath || UPSTREAM_BTFS;
    this.client = new BtfsClient({ apiUrl: this.apiUrl });
    this.process = null;
    this.running = false;
    this.daemonReady = false;
    this.logs = [];
  }

  async init() {
    const upstreamExists = await fs.access(this.upstreamPath).then(() => true).catch(() => false);
    if (!upstreamExists) {
      throw new Error(`BTFS upstream not found at ${this.upstreamPath}. Run: git submodule update --init upstream/btfs`);
    }

    try {
      execSync('docker --version', { stdio: 'ignore' });
    } catch {
      throw new Error('Docker not available. BTFS provider requires Docker to run the go-btfs daemon.');
    }

    logger.info(`BTFS walletless provider ready (upstream: ${this.upstreamPath})`);
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    const online = await this.client.isOnline();
    if (online) {
      this.daemonReady = true;
      this.running = true;
      logger.info('BTFS provider connected to existing daemon');
      return { success: true, provider: 'btfs-storage', mode: 'existing' };
    }

    await this._ensureRepo();

    return new Promise((resolve) => {
      logger.info('Starting walletless BTFS daemon via Docker...');
      this.process = spawn('docker', [
        'run', '--rm',
        '-p', '5001:5001',
        '-p', '4001:4001',
        '-p', '4001:4001/udp',
        '-v', `${this.repoPath}:/data/btfs`,
        '-e', 'BTFS_PATH=/data/btfs',
        'btfs:latest',
        'daemon',
        '--enable-storage-host=false',
      ], { cwd: this.upstreamPath });

      this.running = true;

      const appendLog = (level, data) => {
        const line = data.toString().trim();
        if (!line) return;
        this.logs.push({ ts: Date.now(), level, msg: line });
        if (this.logs.length > 500) this.logs.shift();
      };
      this.process.stdout.on('data', (d) => appendLog('info', d));
      this.process.stderr.on('data', (d) => appendLog('error', d));
      this.process.on('exit', (code) => {
        this.running = false;
        this.daemonReady = false;
        logger.warn(`BTFS daemon exited with code ${code}`);
      });

      const waitForApi = async () => {
        for (let i = 0; i < 30; i++) {
          try {
            await this.client.id();
            this.daemonReady = true;
            logger.info('BTFS daemon is online');
            resolve({ success: true, provider: 'btfs-storage', mode: 'spawned', pid: this.process.pid });
            return;
          } catch {
            await new Promise(r => setTimeout(r, 1000));
          }
        }
        resolve({ success: false, error: 'BTFS daemon did not become reachable within 30s' });
      };
      waitForApi();
    });
  }

  async stop() {
    if (!this.running || !this.process) return { success: true, alreadyStopped: true };
    this.process.kill('SIGTERM');
    this.running = false;
    this.daemonReady = false;
    return { success: true, provider: 'btfs-storage' };
  }

  status() {
    return {
      provider: 'btfs-storage',
      running: this.running,
      daemonReady: this.daemonReady,
      apiUrl: this.apiUrl,
      repoPath: this.repoPath,
      pid: this.process?.pid || null,
      recentLogs: this.logs.slice(-10),
    };
  }

  getClient() {
    return this.client;
  }

  async _ensureRepo() {
    await fs.mkdir(this.repoPath, { recursive: true });
    const initialized = await fs.access(path.join(this.repoPath, 'config')).then(() => true).catch(() => false);
    if (!initialized) {
      logger.info('Initializing walletless BTFS repo...');
      try {
        execSync('docker run --rm -v "' + this.repoPath + ':/data/btfs" btfs:latest init', { cwd: this.upstreamPath, stdio: 'ignore' });
      } catch {
        throw new Error('Failed to initialize BTFS repo. Build the image first: cd upstream/btfs && docker build -t btfs:latest .');
      }
    }
  }
}
