/**
 * StorjProvider — Auto-setup and run a Storj Storage Node.
 *
 * Storj is a decentralized storage network. Storage nodes contribute spare disk
 * space and bandwidth and earn STORJ token payouts. The SDK uses the protocol
 * multisig public address as the payout address; the storage node itself does
 * not need access to any private key.
 *
 * Production notes:
 *   - Storj requires a unique identity (signed certificate) for each node. The
 *     provider downloads the `identity` binary and generates one in the
 *     background if it is missing. Identity generation can take hours or days
 *     depending on CPU luck (difficulty >= 36).
 *   - The operator must supply an external address (`address:port`) reachable
 *     from the internet, a contact email, and how much storage to share.
 *   - The storage node runs as a Docker container managed by the provider.
 *   - Default ports: 28967/tcp + 28967/udp (node), 14002 (dashboard).
 *
 * No local private keys are hard-coded. The payout address defaults to the
 * protocol multisig or can be overridden by the app config.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import os from 'os';
import { promises as fs, existsSync } from 'fs';
import { Logger } from '../core/Logger.js';
import { ResourceMonitor } from '../core/resource-monitor.js';
import { getProtocolPayoutAddress } from './protocol-address.js';

const logger = new Logger('StorjProvider');

const STORJ_DIR = process.env.CHIMERA_STORJ_DIR || path.join(os.homedir(), '.chimera', 'upstream', 'storj');
const STORJ_DATA_DIR = process.env.CHIMERA_STORJ_DATA_DIR || path.join(os.homedir(), '.chimera', 'storj-data');
const IDENTITY_DOWNLOAD_BASE = 'https://github.com/storj/storj/releases/latest/download';
const STORAGENODE_DOWNLOAD_BASE = 'https://github.com/storj/storj/releases/latest/download';
const DEFAULT_IMAGE = 'storjlabs/storagenode:latest';
const DEFAULT_EMAIL = 'terex@localchimera.com';
const DEFAULT_NODE_PORT = 28967;
const DEFAULT_DASHBOARD_PORT = 14002;
const DEFAULT_STORAGE_REFRESH_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_STORAGE_BUFFER_PCT = 0.10; // leave 10% of disk free
const DEFAULT_STORAGE_MIN_FREE_GB = 50; // 50 GB safety buffer
const DEFAULT_STORAGE_RESTART_THRESHOLD_PCT = 0.10; // restart container if allocation changes by 10%

function _platformArch() {
  const platform = os.platform();
  const arch = os.arch();
  const archMap = { x64: 'amd64', arm64: 'arm64', arm: 'arm' };
  const a = archMap[arch] || arch;
  return { platform, arch: a };
}

function _identityExistsSync(identityDir) {
  const cert = path.join(identityDir, 'identity.cert');
  const key = path.join(identityDir, 'identity.key');
  return existsSync(cert) && existsSync(key);
}

function _formatBytesGB(gb) {
  if (gb >= 1024) return `${(gb / 1024).toFixed(2)}TB`;
  return `${gb.toFixed(2)}GB`;
}

function _parseStorageString(str) {
  const match = String(str).trim().match(/^([0-9.]+)\s*(TB|GB|MB|PB|TiB|GiB|MiB|PiB|t|g|m|p)?$/i);
  if (!match) return null;
  const value = parseFloat(match[1]);
  const unit = (match[2] || 'GB').toUpperCase().replace('IB', 'B');
  const multipliers = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, PB: 1024 ** 5 };
  return value * (multipliers[unit] || multipliers.GB);
}

async function _ensureIdentityBinary(binaryPath) {
  try {
    execSync(`${binaryPath} --help`, { stdio: 'ignore' });
    return binaryPath;
  } catch {}

  try {
    execSync('which identity', { stdio: 'ignore' });
    return 'identity';
  } catch {}

  logger.info('Storj identity binary not found; downloading latest release...');
  await fs.mkdir(STORJ_DIR, { recursive: true });
  const { arch } = _platformArch();
  const zipUrl = `${IDENTITY_DOWNLOAD_BASE}/identity_linux_${arch}.zip`;
  const zipPath = path.join(STORJ_DIR, 'identity.zip');
  const output = path.join(STORJ_DIR, 'identity');

  try {
    execSync(`curl -fsSL "${zipUrl}" -o "${zipPath}"`, { stdio: 'inherit' });
    execSync(`unzip -o "${zipPath}" -d "${STORJ_DIR}"`, { stdio: 'ignore' });
    await fs.chmod(output, 0o755);
    await fs.unlink(zipPath);
  } catch (err) {
    throw new Error(`Failed to download Storj identity binary: ${err.message}`);
  }

  try {
    execSync(`${output} --help`, { stdio: 'ignore' });
    return output;
  } catch (err) {
    throw new Error(`Storj identity binary is not executable: ${err.message}`);
  }
}

async function _ensureStorageNodeBinary(binaryPath) {
  try {
    execSync(`${binaryPath} --help`, { stdio: 'ignore' });
    return binaryPath;
  } catch {}

  try {
    execSync('which storagenode', { stdio: 'ignore' });
    return 'storagenode';
  } catch {}

  logger.info('Storj storage node binary not found; downloading latest release...');
  await fs.mkdir(STORJ_DIR, { recursive: true });
  const { arch } = _platformArch();
  const zipUrl = `${STORAGENODE_DOWNLOAD_BASE}/storagenode_linux_${arch}.zip`;
  const zipPath = path.join(STORJ_DIR, 'storagenode.zip');
  const output = path.join(STORJ_DIR, 'storagenode');

  try {
    execSync(`curl -fsSL "${zipUrl}" -o "${zipPath}"`, { stdio: 'inherit' });
    execSync(`unzip -o "${zipPath}" -d "${STORJ_DIR}"`, { stdio: 'ignore' });
    await fs.chmod(output, 0o755);
    await fs.unlink(zipPath);
  } catch (err) {
    throw new Error(`Failed to download Storj storage node binary: ${err.message}`);
  }

  try {
    execSync(`${output} --help`, { stdio: 'ignore' });
    return output;
  } catch (err) {
    throw new Error(`Storj storage node binary is not executable: ${err.message}`);
  }
}

export class StorjProvider {
  constructor(opts = {}) {
    this.running = false;
    this.logs = [];
    this.dataDir = opts.dataDir || STORJ_DATA_DIR;
    this.identityDir = opts.identityDir || path.join(this.dataDir, 'identity');
    this.storageDir = opts.storageDir || path.join(this.dataDir, 'storage');
    this.wallet = getProtocolPayoutAddress(opts);
    this.email = opts.email || process.env.CHIMERA_STORJ_EMAIL || DEFAULT_EMAIL;
    this.externalAddress = opts.externalAddress || opts.address || process.env.CHIMERA_STORJ_ADDRESS || null;
    this.storage = opts.storage || process.env.CHIMERA_STORJ_STORAGE || 'dynamic';
    this.storageBufferPct = opts.storageBufferPct || Number(process.env.CHIMERA_STORJ_STORAGE_BUFFER_PCT) || DEFAULT_STORAGE_BUFFER_PCT;
    this.storageMinFreeGB = opts.storageMinFreeGB || Number(process.env.CHIMERA_STORJ_STORAGE_MIN_FREE_GB) || DEFAULT_STORAGE_MIN_FREE_GB;
    this.storageRefreshIntervalMs = opts.storageRefreshIntervalMs || Number(process.env.CHIMERA_STORJ_STORAGE_REFRESH_MS) || DEFAULT_STORAGE_REFRESH_MS;
    this.storageRestartThresholdPct = opts.storageRestartThresholdPct || Number(process.env.CHIMERA_STORJ_STORAGE_RESTART_THRESHOLD_PCT) || DEFAULT_STORAGE_RESTART_THRESHOLD_PCT;
    this.autoDetectExternalAddress = opts.autoDetectExternalAddress !== false && process.env.CHIMERA_STORJ_AUTO_DETECT_EXTERNAL_ADDRESS !== 'false';
    this.externalAddressLookupUrls = opts.externalAddressLookupUrls || [
      'https://api.ipify.org',
      'https://icanhazip.com',
      'https://checkip.amazonaws.com',
    ];
    this.nodePort = opts.nodePort || Number(process.env.CHIMERA_STORJ_NODE_PORT) || DEFAULT_NODE_PORT;
    this.dashboardPort = opts.dashboardPort || Number(process.env.CHIMERA_STORJ_DASHBOARD_PORT) || DEFAULT_DASHBOARD_PORT;
    this.image = opts.image || process.env.CHIMERA_STORJ_IMAGE || DEFAULT_IMAGE;
    this.containerName = opts.containerName || process.env.CHIMERA_STORJ_CONTAINER_NAME || 'chimera-storagenode';
    this.inline = opts.inline || process.env.CHIMERA_STORJ_INLINE === 'true' || process.env.CHIMERA_PRIVACY_MODE === 'true';
    this.storageNodeBinaryPath = opts.storageNodeBinaryPath || process.env.CHIMERA_STORJ_STORAGENODE_BINARY || path.join(STORJ_DIR, 'storagenode');
    this._identityBinary = null;
    this._storageNodeBinary = null;
    this._identityProcess = null;
    this._nodeProcess = null;
    this._storageInterval = null;
    this._currentAllocationBytes = 0;
    this._resourceMonitor = new ResourceMonitor();
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.identityDir, { recursive: true });
    await fs.mkdir(this.storageDir, { recursive: true });
    await fs.mkdir(path.join(this.storageDir, 'bin'), { recursive: true });

    if (this.inline) {
      this._storageNodeBinary = await _ensureStorageNodeBinary(this.storageNodeBinaryPath);
    } else {
      try {
        execSync('docker --version', { stdio: 'ignore' });
      } catch {
        throw new Error('Storj provider requires Docker, but docker is not available');
      }
    }

    this._identityBinary = await _ensureIdentityBinary(path.join(STORJ_DIR, 'identity'));

    if (!_identityExistsSync(this.identityDir)) {
      logger.warn(`Storj identity not found at ${this.identityDir}. Starting identity generation in the background (this can take hours or days).`);
      this._startIdentityGeneration();
    } else {
      logger.info(`Storj identity found at ${this.identityDir}.`);
    }

    if (!this.email) {
      logger.warn('Storj provider initialized without an operator email. The node will not start until email is set.');
    }
    if (!this.externalAddress) {
      if (this.autoDetectExternalAddress) {
        try {
          const ip = await this._detectPublicIp();
          if (ip) {
            this.externalAddress = `${ip}:${this.nodePort}`;
            logger.info(`Auto-detected Storj external address: ${this.externalAddress}`);
          }
        } catch (err) {
          logger.warn(`Failed to auto-detect public IP for Storj: ${err.message}`);
        }
      }
      if (!this.externalAddress) {
        logger.warn('Storj provider initialized without an external address. The node will not start until externalAddress is set or auto-detection succeeds.');
      }
    }
  }

  async _detectPublicIp() {
    for (const url of this.externalAddressLookupUrls) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const text = (await res.text()).trim();
        if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(text)) return text;
      } catch (err) {
        logger.debug(`Public IP lookup failed at ${url}: ${err.message}`);
      }
    }
    return null;
  }

  _identityExists() {
    return _identityExistsSync(this.identityDir);
  }

  /**
   * Compute the storage allocation to offer to Storj.
   *
   * - If the operator configured a static `storage` string (e.g. "2TB"), it is
   *   used as-is.
   * - Otherwise the provider asks the SDK's ResourceMonitor for the disk info
   *   of the storage directory and offers a share of the available free space,
   *   keeping a buffer for the OS and other apps.
   */
  async _computeStorageAllocation() {
    if (this.storage && this.storage !== 'dynamic') {
      const staticBytes = _parseStorageString(this.storage);
      if (staticBytes !== null) return staticBytes;
    }

    const disk = await this._resourceMonitor.getDiskInfo(this.storageDir);
    const freeGB = disk.diskFreeGB;
    const bufferGB = Math.max(this.storageMinFreeGB, freeGB * this.storageBufferPct);
    let allocatedGB = freeGB - bufferGB;
    if (allocatedGB < 1) allocatedGB = 1;

    return allocatedGB * 1024 ** 3;
  }

  async _getStorageString() {
    const bytes = await this._computeStorageAllocation();
    this._currentAllocationBytes = bytes;
    return _formatBytesGB(bytes / (1024 ** 3));
  }

  /**
   * Refresh the storage allocation periodically. If the allocation changes by
   * more than the configured threshold, restart the Storj container so the new
   * STORAGE env var takes effect.
   */
  _startStorageRefresh() {
    if (this._storageInterval) return;
    this._storageInterval = setInterval(async () => {
      try {
        const bytes = await this._computeStorageAllocation();
        const pctChange = this._currentAllocationBytes > 0
          ? Math.abs(bytes - this._currentAllocationBytes) / this._currentAllocationBytes
          : 0;
        if (pctChange > this.storageRestartThresholdPct) {
          logger.info(`Storj storage allocation changed significantly (${(pctChange * 100).toFixed(1)}%). Restarting container with new allocation.`);
          await this.stop();
          await this.start();
        }
      } catch (err) {
        logger.warn(`Storj storage refresh failed: ${err.message}`);
      }
    }, this.storageRefreshIntervalMs);
  }

  _stopStorageRefresh() {
    if (this._storageInterval) {
      clearInterval(this._storageInterval);
      this._storageInterval = null;
    }
  }

  _startIdentityGeneration() {
    if (this._identityProcess) return;

    const args = ['create', 'storagenode', '--identity-dir', this.identityDir];
    this._identityProcess = spawn(this._identityBinary, args, {
      cwd: this.dataDir,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this._identityProcess.stdout.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        this.logs.push({ ts: Date.now(), level: 'info', msg: `[identity] ${line}` });
        if (this.logs.length > 500) this.logs.shift();
      }
    });

    this._identityProcess.stderr.on('data', (data) => {
      const line = data.toString().trim();
      if (line) {
        this.logs.push({ ts: Date.now(), level: 'error', msg: `[identity] ${line}` });
        if (this.logs.length > 500) this.logs.shift();
      }
    });

    this._identityProcess.on('exit', (code) => {
      this._identityProcess = null;
      if (code === 0) {
        logger.info(`Storj identity generation completed at ${this.identityDir}`);
      } else {
        logger.error(`Storj identity generation exited with code ${code}`);
      }
    });
  }

  async start() {
    if (this.running) return { success: true, alreadyRunning: true };

    if (!this._identityExists()) {
      return {
        success: false,
        provider: 'storj',
        error: 'Storj identity is still being generated. Try again later.',
        identityReady: false,
      };
    }

    if (!this.email || !this.externalAddress) {
      return {
        success: false,
        provider: 'storj',
        error: 'Storj requires email and externalAddress to be configured.',
      };
    }

    const storageString = await this._getStorageString();
    logger.info(`Storj storage allocation: ${storageString}`);

    if (this.inline) {
      return this._startInline(storageString);
    }

    return this._startDocker(storageString);
  }

  _startDocker(storageString) {
    try {
      execSync(`docker ps -a -q -f name=${this.containerName}`, { stdio: 'pipe' });
      execSync(`docker rm -f ${this.containerName}`, { stdio: 'ignore' });
    } catch {}

    const args = [
      'run', '-d', '--restart', 'unless-stopped', '--stop-timeout', '300',
      '-p', `${this.nodePort}:28967/tcp`,
      '-p', `${this.nodePort}:28967/udp`,
      '-p', `127.0.0.1:${this.dashboardPort}:14002`,
      '-e', `WALLET=${this.wallet}`,
      '-e', `EMAIL=${this.email}`,
      '-e', `ADDRESS=${this.externalAddress}`,
      '-e', `STORAGE=${storageString}`,
      '-v', `${this.identityDir}:/app/identity`,
      '-v', `${this.storageDir}:/app/config`,
      '--name', this.containerName,
      this.image,
    ];

    return new Promise((resolve, reject) => {
      this._nodeProcess = spawn('docker', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';
      let error = '';

      this._nodeProcess.stdout.on('data', (data) => { output += data.toString(); });
      this._nodeProcess.stderr.on('data', (data) => { error += data.toString(); });

      this._nodeProcess.on('exit', (code) => {
        if (code === 0) {
          this.running = true;
          this._startStorageRefresh();
          const containerId = output.trim();
          resolve({ success: true, provider: 'storj', containerId, storage: storageString });
        } else {
          reject(new Error(`Storj container failed to start: ${error || output}`));
        }
      });
    });
  }

  _startInline(storageString) {
    const args = [
      'run',
      '--config-dir', this.storageDir,
      '--identity-dir', this.identityDir,
      '--contact.external-address', this.externalAddress,
      '--operator.email', this.email,
      '--operator.wallet', this.wallet,
      '--storage.allocated-disk-space', storageString,
      '--server.address', `:${this.nodePort}`,
      '--console.address', `127.0.0.1:${this.dashboardPort}`,
      '--metrics.app-suffix=-chimera',
      '--metrics.interval=30m',
    ];

    return new Promise((resolve, reject) => {
      this._nodeProcess = spawn(this._storageNodeBinary, args, {
        cwd: this.dataDir,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      this._nodeProcess.stdout.on('data', (data) => {
        const line = data.toString().trim();
        if (line) {
          this.logs.push({ ts: Date.now(), level: 'info', msg: `[node] ${line}` });
          if (this.logs.length > 500) this.logs.shift();
        }
      });

      this._nodeProcess.stderr.on('data', (data) => {
        const line = data.toString().trim();
        if (line) {
          this.logs.push({ ts: Date.now(), level: 'error', msg: `[node] ${line}` });
          if (this.logs.length > 500) this.logs.shift();
        }
      });

      this._nodeProcess.on('error', (err) => {
        reject(new Error(`Storj inline node failed to start: ${err.message}`));
      });

      this._nodeProcess.on('spawn', () => {
        this.running = true;
        this._startStorageRefresh();
        resolve({ success: true, provider: 'storj', inline: true, storage: storageString });
      });
    });
  }

  async stop() {
    if (!this.running) return { success: true, alreadyStopped: true };

    this._stopStorageRefresh();

    if (this.inline) {
      if (this._nodeProcess) {
        this._nodeProcess.kill('SIGTERM');
      }
    } else {
      try {
        execSync(`docker stop -t 300 ${this.containerName}`, { stdio: 'ignore' });
        execSync(`docker rm -f ${this.containerName}`, { stdio: 'ignore' });
      } catch (err) {
        logger.warn(`Storj stop command failed: ${err.message}`);
      }
    }

    this.running = false;
    this._nodeProcess = null;
    return { success: true, provider: 'storj' };
  }

  async status() {
    const identityReady = this._identityExists();
    let containerStatus = null;

    if (this.inline) {
      containerStatus = this._nodeProcess && !this._nodeProcess.killed ? 'running' : 'not found';
    } else {
      try {
        containerStatus = execSync(
          `docker inspect --format='{{.State.Status}}' ${this.containerName}`,
          { encoding: 'utf-8', stdio: 'pipe' },
        ).trim();
      } catch {
        containerStatus = 'not found';
      }
    }

    return {
      provider: 'storj',
      running: this.running,
      inline: this.inline,
      identityReady,
      containerStatus,
      wallet: this.wallet,
      externalAddress: this.externalAddress,
      storage: this.storage,
      currentAllocationBytes: this._currentAllocationBytes,
    };
  }
}
