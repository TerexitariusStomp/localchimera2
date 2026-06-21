import { Logger } from '../core/Logger.js';
import { spawn, execSync } from 'child_process';
import { existsSync, promises as fsp } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

/**
 * CortensorMiner — Cortensor Network Proof-of-Useful-Work miner
 *
 * Cortensor is a decentralized AI network. This miner wraps the native
 * `cortensord` binary (installed separately) and manages its lifecycle.
 *
 * Setup required BEFORE this miner works:
 *   1. Install cortensord: https://github.com/cortensor/installer
 *   2. Whitelist your EVM address with Cortensor Admin (Discord/Telegram)
 *   3. Generate keys:   cortensord ~/.cortensor/.env tool gen_key
 *   4. Register:       cortensord ~/.cortensor/.env tool register
 *   5. Verify:         cortensord ~/.cortensor/.env tool verify
 *
 * Frontend: https://cortensor.network  →  "Nodes" or "Network" tab
 * Your node appears there once registered + verified + online.
 */
export class CortensorMiner {
  constructor(config, inferenceLayer = null) {
    this.config = config;
    this.inferenceLayer = inferenceLayer;
    this.name = 'cortensor';
    this.logger = new Logger('CortensorMiner');
    this.isRunning = false;
    this.walletAddress = config.walletAddress || null;
    this.network = config.network || 'arbitrum-testnet';
    this.cortensorHome = config.cortensorHome || join(homedir(), '.cortensor');
    this.envFile = config.envFile || join(this.cortensorHome, '.env');
    this.cortensordBin = config.cortensordPath || this._findCortensord();

    // Process handle for spawned cortensord
    this._proc = null;
    this._procExitCode = null;

    // Registration state
    this.registered = false;
    this.verified = false;
    this.nodeId = null;
  }

  _findCortensord() {
    const paths = [
      join(homedir(), '.cortensor', 'bin', 'cortensord'),
      '/usr/local/bin/cortensord',
      '/usr/bin/cortensord',
      'cortensord'
    ];
    for (const p of paths) {
      if (existsSync(p)) return p;
    }
    return 'cortensord'; // hope it's in PATH
  }

  async initialize() {
    this.logger.info('Initializing Cortensor miner...');

    // Check if cortensord binary exists
    if (!existsSync(this.cortensordBin) && this.cortensordBin !== 'cortensord') {
      this.logger.warn(`cortensord not found at ${this.cortensordBin}`);
      this.logger.warn('Install Cortensor: curl -L https://github.com/cortensor/installer/archive/main.tar.gz | tar xz');
    } else {
      this.logger.info(`cortensord located: ${this.cortensordBin}`);
    }

    // Validate wallet address if provided
    if (this.walletAddress) {
      if (!this.validateWalletAddress(this.walletAddress)) {
        this.logger.error('Invalid EVM wallet address');
        throw new Error('Invalid wallet address format');
      }
      this.logger.info(`Cortensor wallet: ${this.maskAddress(this.walletAddress)}`);
    } else {
      this.logger.warn('No wallet address configured — rewards disabled');
      this.logger.warn('Get whitelisted: https://discord.gg/cortensor or Telegram support');
    }

    // Check .env file exists
    if (!existsSync(this.envFile)) {
      this.logger.warn(`Cortensor .env not found: ${this.envFile}`);
      this.logger.warn('Run installer first to create ~/.cortensor/.env');
    } else {
      this.logger.info(`Cortensor env: ${this.envFile}`);
    }

    this.logger.info('Cortensor miner initialized');
  }

  validateWalletAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  maskAddress(address) {
    if (!address || address.length < 10) return '***';
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  // ─── Registration ───

  async register() {
    if (!existsSync(this.cortensordBin)) {
      this.logger.error('Cannot register — cortensord binary not found');
      return false;
    }
    if (!existsSync(this.envFile)) {
      this.logger.error('Cannot register — .env file missing');
      return false;
    }

    try {
      this.logger.info('Registering with Cortensor network...');
      execSync(`"${this.cortensordBin}" "${this.envFile}" tool register`, { stdio: 'inherit' });
      this.registered = true;
      this.logger.info('Registration command completed');
      return true;
    } catch (e) {
      this.logger.error(`Registration failed: ${e.message}`);
      this.logger.error('Ensure your address is whitelisted by Cortensor Admin first');
      return false;
    }
  }

  async verify() {
    if (!existsSync(this.cortensordBin)) return false;
    try {
      this.logger.info('Verifying Cortensor node...');
      execSync(`"${this.cortensordBin}" "${this.envFile}" tool verify`, { stdio: 'inherit' });
      this.verified = true;
      this.logger.info('Verification completed');
      return true;
    } catch (e) {
      this.logger.error(`Verification failed: ${e.message}`);
      return false;
    }
  }

  async genKey() {
    if (!existsSync(this.cortensordBin)) return false;
    try {
      this.logger.info('Generating Cortensor node keys...');
      execSync(`"${this.cortensordBin}" "${this.envFile}" tool gen_key`, { stdio: 'inherit' });
      this.logger.info('Keys generated');
      return true;
    } catch (e) {
      this.logger.error(`Key generation failed: ${e.message}`);
      return false;
    }
  }

  // ─── Auto setup pipeline ───

  async autoSetup() {
    this.logger.info('=== Cortensor Auto-Setup ===');

    // 1. Generate keys if needed
    const keyFile = join(this.cortensorHome, 'node.key');
    if (!existsSync(keyFile)) {
      this.logger.info('Node key not found — generating...');
      await this.genKey();
    } else {
      this.logger.info('Node key already exists');
    }

    // 2. Check if private key is still the placeholder
    const envContent = await fsp.readFile(this.envFile, 'utf-8').catch(() => '');
    if (envContent.includes('REPLACE_WITH_YOUR_PRIVATE_KEY')) {
      this.logger.error('============================================================');
      this.logger.error('NODE_PRIVATE_KEY is still the placeholder in ~/.cortensor/.env');
      this.logger.error('Replace it with your actual private key before registration.');
      this.logger.error('============================================================');
      return false;
    }

    // 3. Try register (may fail if not whitelisted yet — that's OK)
    if (!this.registered) {
      this.logger.info('Attempting registration (may fail until whitelisted)...');
      const ok = await this.register();
      if (!ok) {
        this.logger.warn('Registration not yet successful — likely not whitelisted.');
        this.logger.warn('Contact Cortensor Admin with your wallet address:');
        this.logger.warn(this.walletAddress);
        return false;
      }
    }

    // 4. Try verify
    if (!this.verified) {
      this.logger.info('Attempting verification...');
      const ok = await this.verify();
      if (!ok) {
        this.logger.warn('Verification not yet successful.');
        return false;
      }
    }

    this.logger.info('Cortensor setup complete — ready to mine');
    return true;
  }

  // ─── Lifecycle ───

  async start() {
    if (this.isRunning) { this.logger.warn('Already running'); return; }

    if (!existsSync(this.cortensordBin)) {
      this.logger.error('Cannot start — cortensord not installed');
      this.logger.error('Install: https://github.com/cortensor/installer');
      this.isRunning = false;
      return;
    }

    // Run auto-setup (gen_key → register → verify) before mining
    const ready = await this.autoSetup();
    if (!ready) {
      this.logger.warn('Cortensor setup incomplete — miner not started');
      this.logger.warn('Fix NODE_PRIVATE_KEY in ~/.cortensor/.env and/or get whitelisted, then restart');
      return;
    }

    this.logger.info('Starting Cortensor miner (cortensord minerv2)...');

    // Spawn cortensord as a child process
    this._proc = spawn(this.cortensordBin, [this.envFile, 'minerv2'], {
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this._proc.stdout.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) this.logger.info(`[cortensord] ${line.trim()}`);
      }
    });

    this._proc.stderr.on('data', (data) => {
      const lines = data.toString().trim().split('\n');
      for (const line of lines) {
        if (line.trim()) this.logger.warn(`[cortensord] ${line.trim()}`);
      }
    });

    this._proc.on('exit', (code) => {
      this._procExitCode = code;
      this.isRunning = false;
      this.logger.warn(`cortensord exited with code ${code}`);
    });

    this._proc.on('error', (err) => {
      this.logger.error(`cortensord process error: ${err.message}`);
      this.isRunning = false;
    });

    this.isRunning = true;
    this.logger.info('Cortensor miner started');
    this.logger.info('Your node will appear at https://cortensor.network once online');
  }

  async startMonitoring() {
    // Cortensor doesn't have a separate monitoring mode;
    // minerv2 handles its own idle state.
    await this.start();
  }

  async stop() {
    if (!this.isRunning) return;
    this.logger.info('Stopping Cortensor miner...');

    if (this._proc) {
      this._proc.kill('SIGTERM');
      // Give it 5s to exit gracefully
      await new Promise(resolve => setTimeout(resolve, 5000));
      if (!this._proc.killed) {
        this._proc.kill('SIGKILL');
      }
      this._proc = null;
    }

    this.isRunning = false;
    this.logger.info('Cortensor miner stopped');
  }

  async onInferenceTask(task) {
    this.logger.info(`Cortensor inference task: ${task.id || 'unknown'}`);
    if (this.inferenceLayer) {
      return await this.inferenceLayer.handleInferenceRequest(task, this.name);
    }
    return { success: false, error: 'No inference router available' };
  }

  getStatus() {
    return {
      running: this.isRunning,
      name: this.name,
      walletConfigured: !!this.walletAddress,
      walletAddress: this.maskAddress(this.walletAddress),
      network: this.network,
      cortensordFound: existsSync(this.cortensordBin) || this.cortensordBin === 'cortensord',
      cortensordPath: this.cortensordBin,
      envFileFound: existsSync(this.envFile),
      envFilePath: this.envFile,
      registered: this.registered,
      verified: this.verified,
      procExitCode: this._procExitCode,
      nodeId: this.nodeId
    };
  }
}
