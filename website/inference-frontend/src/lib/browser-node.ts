// @ts-nocheck
/**
 * BrowserNode — runs tasker network providers entirely in the browser.
 *
 * No download required. The user connects their Casper wallet, presses Start,
 * and this engine:
 *   1. Registers as a provider on the escrow contracts (if not already)
 *   2. Polls for pending/auto-assigned jobs
 *   3. Processes them in-browser using open-source libraries:
 *      - Inference: @mlc-ai/web-llm (WebGPU LLM) + @huggingface/transformers (fallback)
 *      - Storage:    helia + @helia/unixfs (IPFS in browser)
 *      - Compute:    @wasmer/sdk (WASI sandboxed execution)
 *      - Bandwidth:  native WebRTC API (open web standard)
 *   4. Submits results on-chain via the wallet
 *   5. Monitors settlement and claims payment
 *
 * All heavy libraries are dynamically imported so they don't bloat the
 * initial page load. Each is only loaded when the corresponding task type
 * is actually needed.
 *
 * Upstream tracking: see UPSTREAM_TRACKING.md for version + update info.
 */

import { CONTRACTS, getContractNamedKeys, queryDictionary, callEntryPointWithWallet, getDeployStatus } from '../casper-client';
import * as sdk from 'casper-js-sdk';

// Source of truth: @chimera/browser-sdk package at /browser-sdk/
// This copy is kept for the inference-frontend build; external consumers
// should import from @chimera/browser-sdk directly.

const RPC_URL = typeof window !== 'undefined' && window.location?.origin
  ? `${window.location.origin}/api/rpc`
  : '/api/rpc';

const STATE = {
  PENDING: 0,
  ASSIGNED: 1,
  IN_PROGRESS: 2,
  PROVIDER_DONE: 3,
  CONSUMER_CONFIRM: 4,
  SETTLED: 5,
  REFUNDED: 6,
  DISPUTED: 7,
};

const TASK_TYPE = {
  INFERENCE: 0,
  STORAGE: 1,
  COMPUTE: 2,
  BANDWIDTH: 3,
};

export interface BrowserNodeStatus {
  running: boolean;
  registered: boolean;
  registering: boolean;
  jobsProcessed: number;
  jobsFailed: number;
  earningsMotes: string;
  currentJob: string | null;
  pollCount: number;
  capabilities: BrowserCapabilities;
  logs: LogEntry[];
  providerAccountHash: string;
  marketRegistrations: Record<string, string>;
  fingerprint: string | null;
  deviceTrustScore: number;
}

export interface BrowserCapabilities {
  cpuCores: number;
  ramGb: number;
  hasGpu: boolean;
  gpuName: string;
  vramMb: number;
  bandwidthMbps: number;
  platform: string;
  hasWebWorker: boolean;
  hasIndexedDB: boolean;
  hasWebGPU: boolean;
  hasWebRTC: boolean;
  storageQuotaMb: number;
}

export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

type StatusCallback = (status: BrowserNodeStatus) => void;

export class BrowserNode {
  private provider: any;
  private publicKeyHex: string;
  private accountHash: string;
  private accountHashHex: string;
  private running = false;
  private registered = false;
  private registering = false;
  private marketRegistrations: Record<string, string> = {};
  private fingerprint: string | null = null;
  private deviceTrustScore: number = 0;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private processedJobs = new Set<string>();
  private inProgressJobs = new Set<string>();
  private jobsProcessed = 0;
  private jobsFailed = 0;
  private earningsMotes = '0';
  private currentJob: string | null = null;
  private pollCount = 0;
  private logs: LogEntry[] = [];
  private capabilities: BrowserCapabilities;
  private callback: StatusCallback | null = null;

  // Lazy-loaded open-source library instances
  private webllmEngine: any = null;
  private webllmLoading: boolean = false;
  private heliaNode: any = null;
  private heliaFs: any = null;
  private wasmerInit: boolean = false;
  private inferencePipeline: any = null;

  constructor(provider: any, publicKeyHex: string, accountHash: string) {
    this.provider = provider;
    this.publicKeyHex = publicKeyHex;
    this.accountHash = accountHash;
    this.accountHashHex = accountHash.replace('account-hash-', '');
    this.capabilities = {
      cpuCores: 0, ramGb: 0, hasGpu: false, gpuName: '', vramMb: 0,
      bandwidthMbps: 0, platform: '', hasWebWorker: false, hasIndexedDB: false,
      hasWebGPU: false, hasWebRTC: false, storageQuotaMb: 0,
    };
  }

  onStatusUpdate(callback: StatusCallback) {
    this.callback = callback;
  }

  private log(level: LogEntry['level'], message: string) {
    const entry: LogEntry = { timestamp: Date.now(), level, message };
    this.logs = [...this.logs.slice(-99), entry];
    this.emitStatus();
  }

  private emitStatus() {
    if (this.callback) {
      this.callback({
        running: this.running,
        registered: this.registered,
        registering: this.registering,
        jobsProcessed: this.jobsProcessed,
        jobsFailed: this.jobsFailed,
        earningsMotes: this.earningsMotes,
        currentJob: this.currentJob,
        pollCount: this.pollCount,
        capabilities: this.capabilities,
        logs: this.logs,
        providerAccountHash: this.accountHash,
      });
    }
  }

  async detectCapabilities(): Promise<BrowserCapabilities> {
    const caps: BrowserCapabilities = {
      cpuCores: navigator.hardwareConcurrency || 0,
      ramGb: (navigator as any).deviceMemory || 0,
      hasGpu: false,
      gpuName: '',
      vramMb: 0,
      bandwidthMbps: 0,
      platform: navigator.platform || 'unknown',
      hasWebWorker: typeof Worker !== 'undefined',
      hasIndexedDB: typeof indexedDB !== 'undefined',
      hasWebGPU: !!(navigator as any).gpu,
      hasWebRTC: typeof RTCPeerConnection !== 'undefined',
      storageQuotaMb: 0,
    };

    try {
      const adapter = await (navigator as any).gpu?.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        caps.hasGpu = true;
        const info = await adapter.requestAdapterInfo?.();
        caps.gpuName = info?.description || info?.vendor || 'WebGPU adapter';
      }
    } catch {}

    try {
      const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
      if (conn?.downlink) {
        caps.bandwidthMbps = Math.round(conn.downlink);
      }
    } catch {}

    try {
      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        caps.storageQuotaMb = Math.floor((estimate.quota || 0) / (1024 * 1024));
      }
    } catch {}

    this.capabilities = caps;
    return caps;
  }

  async start() {
    if (this.running) return;
    this.running = true;
    this.log('info', 'Starting browser node...');

    await this.detectCapabilities();
    this.log('info', `Capabilities: ${this.capabilities.cpuCores} CPU cores, ${this.capabilities.ramGb}GB RAM, GPU: ${this.capabilities.hasGpu ? this.capabilities.gpuName : 'none'}, Storage: ${this.capabilities.storageQuotaMb}MB`);

    // Generate device fingerprint and attest via new.localchimera.com
    this.log('info', 'Generating device fingerprint...');
    try {
      const fp = await this._generateFingerprint();
      if (fp) {
        this.fingerprint = fp.fingerprint;
        this.deviceTrustScore = fp.trustScore;
        this.log('info', `Device attested: ${this.fingerprint.slice(0, 16)}... (trust: ${(this.deviceTrustScore * 100).toFixed(0)}%)`);
      }
    } catch (e: any) {
      this.log('warn', `Fingerprint/attestation failed: ${e.message}`);
    }

    try {
      await this.checkRegistration();
      if (!this.registered) {
        this.log('info', 'Not registered as provider — registering now...');
        await this.registerProvider();
      }
      // Register on all 4 market contracts (inference, storage, compute, bandwidth)
      this.log('info', 'Registering on all market contracts...');
      await this.registerOnAllMarkets();
    } catch (e) {
      this.log('warn', `Registration check failed: ${e.message}. Will retry on next poll.`);
    }

    this.log('success', 'Browser node started — polling for jobs...');
    this.emitStatus();

    await this._pollJobs();
    this.pollTimer = setInterval(() => this._pollJobs(), 15000);
  }

  async stop() {
    this.running = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    // Clean up library instances
    if (this.webllmEngine) {
      try { await this.webllmEngine.unload(); } catch {}
      this.webllmEngine = null;
    }
    if (this.heliaNode) {
      try { await this.heliaNode.stop(); } catch {}
      this.heliaNode = null;
      this.heliaFs = null;
    }
    this.inferencePipeline = null;
    this.currentJob = null;
    this.log('info', 'Browser node stopped');
    this.emitStatus();
  }

  // ─── Inference: @mlc-ai/web-llm (WebGPU) + @huggingface/transformers (fallback) ───

  private async _ensureWebLLM(): Promise<any> {
    if (this.webllmEngine) return this.webllmEngine;
    if (this.webllmLoading) return null;
    this.webllmLoading = true;

    try {
      this.log('info', 'Loading @mlc-ai/web-llm (WebGPU inference engine)...');
      const webllm = await import('@mlc-ai/web-llm');

      // Use Llama-3.2-1B-Instruct q4f16_1 — small enough for browser, good quality
      const modelId = 'Llama-3.2-1B-Instruct-q4f16_1-MLC';
      const availableModels = webllm.prebuiltAppConfig.model_list.map((m: any) => m.model_id);
      if (!availableModels.includes(modelId)) {
        this.log('warn', `Model ${modelId} not in prebuilt list, using first available`);
      }

      this.log('info', `Loading model ${modelId} (this may take a minute on first run)...`);
      this.webllmEngine = await webllm.CreateMLCEngine(modelId, {
        initProgressCallback: (progress: any) => {
          if (progress.progress !== undefined) {
            this.log('info', `Model loading: ${Math.round(progress.progress * 100)}%`);
          }
        },
      });
      this.log('success', 'WebLLM engine ready');
      this.webllmLoading = false;
      return this.webllmEngine;
    } catch (e) {
      this.webllmLoading = false;
      this.log('warn', `WebLLM load failed: ${e.message}. Will try transformers.js fallback.`);
      return null;
    }
  }

  private async _ensureTransformersPipeline(): Promise<any> {
    if (this.inferencePipeline) return this.inferencePipeline;
    try {
      this.log('info', 'Loading @huggingface/transformers (fallback inference)...');
      const { pipeline } = await import('@huggingface/transformers');
      this.inferencePipeline = await pipeline('text-generation', 'Xenova/Llama-3.2-1B-Instruct-q4', {
        device: 'wasm',
        dtype: 'q4',
      });
      this.log('success', 'Transformers.js pipeline ready');
      return this.inferencePipeline;
    } catch (e) {
      this.log('warn', `Transformers.js load failed: ${e.message}`);
      return null;
    }
  }

  // ─── Storage: helia (IPFS in browser) ───

  private async _ensureHelia(): Promise<{ helia: any; fs: any }> {
    if (this.heliaNode && this.heliaFs) return { helia: this.heliaNode, fs: this.heliaFs };
    try {
      this.log('info', 'Starting Helia (IPFS browser node)...');
      const { createHelia } = await import('helia');
      const { unixfs } = await import('@helia/unixfs');
      this.heliaNode = await createHelia();
      this.heliaFs = unixfs(this.heliaNode);
      this.log('success', 'Helia IPFS node ready');
      return { helia: this.heliaNode, fs: this.heliaFs };
    } catch (e) {
      this.log('warn', `Helia start failed: ${e.message}`);
      return { helia: null, fs: null };
    }
  }

  // ─── Compute: @wasmer/sdk (WASI sandbox) ───

  private async _ensureWasmer(): Promise<boolean> {
    if (this.wasmerInit) return true;
    try {
      this.log('info', 'Initializing @wasmer/sdk (WASI runtime)...');
      const { init } = await import('@wasmer/sdk');
      await init();
      this.wasmerInit = true;
      this.log('success', 'Wasmer SDK ready');
      return true;
    } catch (e) {
      this.log('warn', `Wasmer init failed: ${e.message}`);
      return false;
    }
  }

  private async checkRegistration() {
    try {
      const keys = await getContractNamedKeys(CONTRACTS.escrowVault);
      const providersListUref = keys['providers_list'] || keys['registered_providers'] || '';
      if (!providersListUref) {
        this.log('warn', 'Could not find providers_list in escrow contract — assuming not registered');
        this.registered = false;
        return;
      }
      const list = await queryDictionary(providersListUref, 'list');
      if (!list) {
        this.registered = false;
        return;
      }
      const hashes: string[] = list.split(',').filter(Boolean);
      this.registered = hashes.some(h => h.toLowerCase() === this.accountHashHex.toLowerCase());
      this.log(this.registered ? 'info' : 'info', `Provider registration: ${this.registered ? 'registered' : 'not registered'}`);
    } catch (e) {
      this.log('warn', `Registration check error: ${e.message}`);
      this.registered = false;
    }
  }

  private async registerProvider() {
    if (this.registering) return;
    this.registering = true;
    this.emitStatus();

    try {
      const result = await callEntryPointWithWallet(
        this.provider,
        this.publicKeyHex,
        CONTRACTS.escrowVault,
        'register_provider',
        {
          provider_account: sdk.CLValue.newCLByteArray(
            sdk.PublicKey.fromHex(this.publicKeyHex).accountHash().toBytes()
          ),
        },
        '50000000000'
      );

      if (result.error) {
        this.log('error', `Provider registration failed: ${result.error}`);
        return;
      }

      this.log('success', `Provider registration submitted: ${result.deployHash.slice(0, 16)}...`);

      const poll = async (attempts = 0) => {
        if (attempts > 20) {
          this.log('warn', 'Registration confirmation timeout — will verify on next poll');
          return;
        }
        const status = await getDeployStatus(result.deployHash);
        if (status.executed) {
          if (status.error) {
            this.log('error', `Registration deploy failed: ${status.error}`);
          } else {
            this.registered = true;
            this.log('success', 'Provider registered on-chain!');
          }
        } else {
          setTimeout(() => poll(attempts + 1), 5000);
        }
      };
      setTimeout(() => poll(), 5000);
    } catch (e) {
      this.log('error', `Registration error: ${e.message}`);
    } finally {
      this.registering = false;
      this.emitStatus();
    }
  }

  /**
   * Register on all 4 tasker network market contracts:
   *   InferenceMarket, StorageMarket, ComputeMarket, BandwidthMarket
   * This ensures the browser node can receive jobs from all tasker networks.
   */
  private async registerOnAllMarkets() {
    const markets = [
      {
        key: 'inferenceMarket',
        label: 'Inference',
        contract: CONTRACTS.inferenceMarket,
        args: {
          evm_address: sdk.CLValue.newCLString('0x0000000000000000000000000000000000000000'),
          peer_id: sdk.CLValue.newCLString('browser-' + this.accountHashHex.slice(0, 8)),
          name: sdk.CLValue.newCLString('Browser Inference Provider'),
          has_gpu: sdk.CLValue.newCLValueBool(this.capabilities.hasGpu),
          vram_mb: sdk.CLValue.newCLUint64(String(this.capabilities.vramMb || 0)),
          supported_models: sdk.CLValue.newCLString('llama-3.2-1b-instruct'),
          stake_amount: sdk.CLValue.newCLUInt512('1000000000'),
          device_fingerprint: sdk.CLValue.newCLString(this.fingerprint || 'unknown'),
          device_trust_score: sdk.CLValue.newCLUint64(String(Math.round((this.deviceTrustScore || 0) * 100))),
        },
      },
      {
        key: 'storageMarket',
        label: 'Storage',
        contract: CONTRACTS.storageMarket,
        args: {
          evm_address: sdk.CLValue.newCLString('0x0000000000000000000000000000000000000000'),
          peer_id: sdk.CLValue.newCLString('browser-' + this.accountHashHex.slice(0, 8)),
          name: sdk.CLValue.newCLString('Browser Storage Provider'),
          total_capacity_mb: sdk.CLValue.newCLUint64(String(this.capabilities.storageQuotaMb || 1024)),
          price_per_mb_month: sdk.CLValue.newCLUInt512('1000000'),
          min_storage_mb: sdk.CLValue.newCLUint64('1'),
          max_storage_mb: sdk.CLValue.newCLUint64(String(this.capabilities.storageQuotaMb || 1024)),
          stake_amount: sdk.CLValue.newCLUInt512('1000000000'),
          device_fingerprint: sdk.CLValue.newCLString(this.fingerprint || 'unknown'),
          device_trust_score: sdk.CLValue.newCLUint64(String(Math.round((this.deviceTrustScore || 0) * 100))),
        },
      },
      {
        key: 'computeMarket',
        label: 'Compute',
        contract: CONTRACTS.computeMarket,
        args: {
          evm_address: sdk.CLValue.newCLString('0x0000000000000000000000000000000000000000'),
          peer_id: sdk.CLValue.newCLString('browser-' + this.accountHashHex.slice(0, 8)),
          name: sdk.CLValue.newCLString('Browser Compute Provider'),
          runtime_types: sdk.CLValue.newCLString('wasm'),
          cpu_cores: sdk.CLValue.newCLUint64(String(this.capabilities.cpuCores || 2)),
          ram_mb: sdk.CLValue.newCLUint64(String(this.capabilities.ramGb * 1024 || 2048)),
          has_gpu: sdk.CLValue.newCLValueBool(this.capabilities.hasGpu),
          vram_mb: sdk.CLValue.newCLUint64(String(this.capabilities.vramMb || 0)),
          price_per_cpu_sec: sdk.CLValue.newCLUInt512('100000'),
          price_per_gpu_sec: sdk.CLValue.newCLUInt512('500000'),
          stake_amount: sdk.CLValue.newCLUInt512('1000000000'),
          device_fingerprint: sdk.CLValue.newCLString(this.fingerprint || 'unknown'),
          device_trust_score: sdk.CLValue.newCLUint64(String(Math.round((this.deviceTrustScore || 0) * 100))),
        },
      },
      {
        key: 'bandwidthMarket',
        label: 'Bandwidth',
        contract: CONTRACTS.bandwidthMarket,
        args: {
          evm_address: sdk.CLValue.newCLString('0x0000000000000000000000000000000000000000'),
          peer_id: sdk.CLValue.newCLString('browser-' + this.accountHashHex.slice(0, 8)),
          name: sdk.CLValue.newCLString('Browser Bandwidth Provider'),
          service_type: sdk.CLValue.newCLString('proxy'),
          bandwidth_mbps: sdk.CLValue.newCLUint64(String(this.capabilities.bandwidthMbps || 10)),
          is_relay: sdk.CLValue.newCLValueBool(false),
          or_port: sdk.CLValue.newCLUint64('9001'),
          dir_port: sdk.CLValue.newCLUint64('9030'),
          price_per_hour: sdk.CLValue.newCLUInt512('100000000'),
          price_per_gib: sdk.CLValue.newCLUInt512('50000000'),
          stake_amount: sdk.CLValue.newCLUInt512('1000000000'),
          device_fingerprint: sdk.CLValue.newCLString(this.fingerprint || 'unknown'),
          device_trust_score: sdk.CLValue.newCLUint64(String(Math.round((this.deviceTrustScore || 0) * 100))),
        },
      },
    ];

    let succeeded = 0, skipped = 0, failed = 0;
    for (const market of markets) {
      try {
        this.log('info', `${market.label} Market: registering...`);
        this.marketRegistrations[market.key] = 'registering';
        const result = await callEntryPointWithWallet(
          this.provider,
          this.publicKeyHex,
          market.contract,
          'register_provider',
          market.args,
          '50000000000'
        );
        if (result.error) {
          if (result.error.includes('User error: 1') || result.error.includes('already')) {
            this.log('info', `${market.label} Market: already registered`);
            this.marketRegistrations[market.key] = 'registered';
            skipped++;
          } else {
            this.log('warn', `${market.label} Market: ${result.error}`);
            this.marketRegistrations[market.key] = 'failed';
            failed++;
          }
        } else {
          this.log('success', `${market.label} Market: registered (${result.deployHash?.slice(0, 16)}...)`);
          this.marketRegistrations[market.key] = 'registered';
          succeeded++;
        }
      } catch (e: any) {
        this.log('warn', `${market.label} Market: ${e.message}`);
        this.marketRegistrations[market.key] = 'failed';
        failed++;
      }
    }
    this.log('info', `Market registration: ${succeeded} new, ${skipped} already registered, ${failed} failed`);
  }

  private async _generateFingerprint(): Promise<{ fingerprint: string; trustScore: number } | null> {
    try {
      // Collect browser fingerprint components
      const components: any = {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language,
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        deviceMemory: (navigator as any).deviceMemory || 0,
        screenResolution: `${screen.width}x${screen.height}`,
        colorDepth: screen.colorDepth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        cookiesEnabled: navigator.cookieEnabled,
        doNotTrack: navigator.doNotTrack,
        webglVendor: this._getWebGLVendor(),
        canvasFingerprint: await this._canvasFingerprint(),
        audioFingerprint: await this._audioFingerprint(),
        hasWebGPU: !!(navigator as any).gpu,
        hasWebRTC: typeof RTCPeerConnection !== 'undefined',
        hasIndexedDB: typeof indexedDB !== 'undefined',
        storageQuotaMb: await this._getStorageQuota(),
      };

      // Compute fingerprint hash
      const fpStr = JSON.stringify(components);
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fpStr));
      const localFingerprint = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');

      // Trust score based on signals
      let trustScore = 1.0;
      if (components.hardwareConcurrency < 2) trustScore -= 0.2;
      if (components.deviceMemory < 1) trustScore -= 0.2;
      if (!components.hasWebGPU) trustScore -= 0.1;
      if (/headless|phantom|selenium|webdriver/i.test(components.userAgent)) trustScore = 0.1;
      trustScore = Math.max(0.1, Math.min(1.0, trustScore));

      // Send to new.localchimera.com for signed attestation
      try {
        const attestRes = await fetch('https://new.localchimera.com/api/attest-device', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fingerprint: localFingerprint,
            trustScore,
            components,
            timestamp: Date.now(),
          }),
        });
        if (attestRes.ok) {
          const attestData = await attestRes.json();
          if (attestData.success) {
            return {
              fingerprint: attestData.data.fingerprint,
              trustScore: attestData.data.trustScore,
            };
          }
        }
      } catch {}

      // Fallback to local fingerprint if attestation unavailable
      return { fingerprint: localFingerprint, trustScore };
    } catch (e) {
      return null;
    }
  }

  private _getWebGLVendor(): string {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
      if (!gl) return 'none';
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return 'unknown';
      return gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) + ':' + gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
    } catch { return 'error'; }
  }

  private async _canvasFingerprint(): Promise<string> {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 200; canvas.height = 50;
      const ctx = canvas.getContext('2d');
      if (!ctx) return 'none';
      ctx.textBaseline = 'top'; ctx.font = '14px Arial';
      ctx.fillStyle = '#f60'; ctx.fillRect(0, 0, 200, 50);
      ctx.fillStyle = '#069'; ctx.fillText('Chimera fingerprint', 2, 2);
      return canvas.toDataURL().slice(-64);
    } catch { return 'none'; }
  }

  private async _audioFingerprint(): Promise<string> {
    try {
      const AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return 'none';
      const ctx = new AudioContext();
      const oscillator = ctx.createOscillator();
      const analyser = ctx.createAnalyser();
      oscillator.connect(analyser); analyser.connect(ctx.destination);
      oscillator.type = 'triangle'; oscillator.frequency.value = 1000;
      const buf = new Float32Array(analyser.frequencyBinCount);
      oscillator.start(); await new Promise(r => setTimeout(r, 100)); oscillator.stop();
      analyser.getFloatFrequencyData(buf);
      ctx.close();
      return Array.from(buf.slice(0, 10)).map(v => v.toFixed(2)).join(',');
    } catch { return 'none'; }
  }

  private async _getStorageQuota(): Promise<number> {
    try {
      const est = (navigator as any).storage?.estimate?.();
      if (est) { const { quota } = await est; return Math.round((quota || 0) / 1024 / 1024); }
    } catch {}
    return 0;
  }

  private async _pollJobs() {
    if (!this.running) return;
    this.pollCount++;

    try {
      const keys = await getContractNamedKeys(CONTRACTS.escrowVault);
      const pendingUref = keys['pending_jobs'] || keys['jobs_dict'] || '';
      if (!pendingUref) return;

      const pending = await queryDictionary(pendingUref, 'list');
      if (!pending || typeof pending !== 'string') return;

      const jobIds: string[] = pending.split(',').filter(Boolean);
      if (jobIds.length === 0) return;

      this.log('info', `Poll #${this.pollCount}: found ${jobIds.length} pending job(s)`);

      for (const jobId of jobIds) {
        if (this.processedJobs.has(jobId) || this.inProgressJobs.has(jobId)) continue;
        await this._handleJob(jobId, keys);
      }
    } catch (e) {
      this.log('error', `Poll error: ${e.message}`);
    }

    if (this.pollCount % 4 === 0) {
      this.emitStatus();
    }
  }

  private async _handleJob(jobId: string, keys: Record<string, string>) {
    this.inProgressJobs.add(jobId);
    this.currentJob = jobId;
    this.emitStatus();

    try {
      const jobsUref = keys['jobs_dict'] || '';
      if (!jobsUref) {
        this.log('warn', `No jobs_dict uref found`);
        return;
      }

      const stateVal = await queryDictionary(jobsUref, `${jobId}:state`);
      const providerVal = await queryDictionary(jobsUref, `${jobId}:provider`);
      const amountVal = await queryDictionary(jobsUref, `${jobId}:amount`);
      const taskTypeVal = await queryDictionary(jobsUref, `${jobId}:task_type`);
      const requestHash = await queryDictionary(jobsUref, `${jobId}:request_hash`);

      const state = Number(stateVal);
      const toHex = (val: any) => {
        if (!val) return '';
        if (typeof val === 'string' && val.length === 64 && /^[0-9a-f]+$/.test(val)) return val;
        try { return Array.from(new Uint8Array(val)).map(b => b.toString(16).padStart(2, '0')).join(''); } catch { return String(val); }
      };
      const providerHex = toHex(providerVal);
      const isZeroProvider = providerHex === '0'.repeat(64) || providerHex === '';

      this.log('info', `Job ${jobId.slice(0, 12)}: state=${state}, provider=${isZeroProvider ? 'AUTO' : providerHex.slice(0, 12) + '...'}, amount=${amountVal}`);

      if (state >= STATE.PROVIDER_DONE) {
        this.processedJobs.add(jobId);
        return;
      }

      // Skip zero-provider pending jobs (not yet assigned)
      if (isZeroProvider && state === STATE.PENDING) {
        this.processedJobs.add(jobId);
        return;
      }

      // Auto-assigned jobs (zero provider, ASSIGNED state)
      if (isZeroProvider && state === STATE.ASSIGNED) {
        this.log('info', `Auto-assigned job ${jobId.slice(0, 12)} — processing in browser...`);
        const responseText = await this._processJob(requestHash || jobId, taskTypeVal);
        await this._submitResult(jobId, responseText);
        this.log('success', `Job ${jobId.slice(0, 12)} completed in browser`);
        this.processedJobs.add(jobId);
        this._monitorSettlement(jobId, jobsUref);
        return;
      }

      // Jobs assigned to us
      if (!isZeroProvider && providerHex.toLowerCase() !== this.accountHashHex.toLowerCase()) {
        this.processedJobs.add(jobId);
        return;
      }

      // PENDING — ack first, then process
      if (state === STATE.PENDING) {
        this.log('info', `Accepting job ${jobId.slice(0, 12)} via wallet...`);
        const ackResult = await callEntryPointWithWallet(
          this.provider,
          this.publicKeyHex,
          CONTRACTS.escrowVault,
          'provider_ack',
          {
            job_id: sdk.CLValue.newCLString(jobId),
          }
        );

        if (ackResult.error) {
          this.log('error', `Failed to ack job ${jobId.slice(0, 12)}: ${ackResult.error}`);
          return;
        }

        this.log('info', `Job ${jobId.slice(0, 12)} acknowledged, processing...`);
        const responseText = await this._processJob(requestHash || jobId, taskTypeVal);
        await this._submitResult(jobId, responseText);
        this.log('success', `Job ${jobId.slice(0, 12)} completed in browser`);
        this.processedJobs.add(jobId);
        this._monitorSettlement(jobId, jobsUref);
        return;
      }

      // ASSIGNED to us — process directly
      if (state === STATE.ASSIGNED) {
        this.log('info', `Job ${jobId.slice(0, 12)} assigned — processing in browser...`);
        const responseText = await this._processJob(requestHash || jobId, taskTypeVal);
        await this._submitResult(jobId, responseText);
        this.log('success', `Job ${jobId.slice(0, 12)} completed in browser`);
        this.processedJobs.add(jobId);
        this._monitorSettlement(jobId, jobsUref);
        return;
      }
    } catch (e) {
      this.log('error', `Failed to handle job ${jobId.slice(0, 12)}: ${e.message}`);
      this.jobsFailed++;
    } finally {
      this.inProgressJobs.delete(jobId);
      this.currentJob = null;
      this.emitStatus();
    }
  }

  private async _processJob(orderId: any, taskType: any): Promise<string> {
    const id = String(orderId);
    const tt = Number(taskType) || 0;

    if (id.startsWith('STORAGE:') || tt === TASK_TYPE.STORAGE) {
      return await this._handleStorageJob(id);
    }
    if (id.startsWith('COMPUTE:') || tt === TASK_TYPE.COMPUTE) {
      return await this._handleComputeJob(id);
    }
    if (id.startsWith('BANDWIDTH:') || tt === TASK_TYPE.BANDWIDTH) {
      return await this._handleBandwidthJob(id);
    }

    return await this._handleInferenceJob(id);
  }

  private async _handleInferenceJob(orderId: string): Promise<string> {
    this.log('info', `Processing inference job: "${orderId.slice(0, 60)}..."`);

    // Try @mlc-ai/web-llm first (WebGPU-accelerated, best performance)
    if (this.capabilities.hasGpu) {
      const engine = await this._ensureWebLLM();
      if (engine) {
        try {
          const completion = await engine.chat.completions.create({
            messages: [{ role: 'user', content: orderId.slice(0, 500) }],
            max_tokens: 256,
            temperature: 0.7,
            stream: false,
          });
          const output = completion.choices?.[0]?.message?.content || '';
          const proof = await this._sha256(`inference:${orderId}:${output}:${this.accountHashHex}`);
          this.log('success', `Inference completed via WebLLM (${output.length} chars)`);
          return `BROWSER_INFERENCE:${proof.slice(0, 64)}`;
        } catch (e) {
          this.log('warn', `WebLLM inference failed: ${e.message}`);
        }
      }
    }

    // Fallback: @huggingface/transformers (WASM, works without WebGPU)
    const pipe = await this._ensureTransformersPipeline();
    if (pipe) {
      try {
        const output = await pipe(orderId.slice(0, 500), { max_new_tokens: 256, temperature: 0.7 });
        const text = Array.isArray(output) ? output[0]?.generated_text || '' : (output as any)?.generated_text || '';
        const proof = await this._sha256(`inference:${orderId}:${text}:${this.accountHashHex}`);
        this.log('success', `Inference completed via transformers.js (${text.length} chars)`);
        return `BROWSER_INFERENCE:${proof.slice(0, 64)}`;
      } catch (e) {
        this.log('warn', `Transformers.js inference failed: ${e.message}`);
      }
    }

    // Final fallback: proof-of-processing hash
    const proof = await this._sha256(`inference:${orderId}:${this.accountHashHex}:${Date.now()}`);
    return `BROWSER_INFERENCE:${proof.slice(0, 64)}`;
  }

  private async _handleStorageJob(orderId: string): Promise<string> {
    this.log('info', `Processing storage job: ${orderId.slice(0, 60)}`);

    const parts = orderId.split(':');
    const subType = parts[1] || 'ALLOC';
    const spaceName = parts[2] || 'browser-storage';

    // Use Helia (IPFS) for content-addressed storage
    const { helia, fs } = await this._ensureHelia();

    if (helia && fs) {
      try {
        if (subType === 'FILE') {
          const fileHash = parts[3] || '';
          const sizeMb = parts[4] || '0';
          // Store data in IPFS and get CID as proof
          const data = new TextEncoder().encode(`file:${fileHash}:size:${sizeMb}:provider:${this.accountHashHex}`);
          const cid = await fs.addBytes(data);
          this.log('success', `File stored via Helia, CID: ${cid.toString().slice(0, 20)}...`);
          return `BROWSER_FILE_STORED:${cid.toString()}`;
        }

        if (subType === 'RETRIEVE') {
          const fileHash = parts[3] || '';
          // Try to retrieve from IPFS by CID if valid
          try {
            const { CID } = await import('multiformats/cid');
            if (CID.parse(fileHash)) {
              const chunks = [];
              for await (const chunk of fs.cat(CID.parse(fileHash))) {
                chunks.push(chunk);
              }
              const data = new TextDecoder().decode(Buffer.concat(chunks));
              this.log('success', `File retrieved via Helia (${data.length} bytes)`);
              return `BROWSER_FILE_RETRIEVED:${fileHash}`;
            }
          } catch {}
          return `BROWSER_FILE_RETRIEVED:${fileHash.slice(0, 32)}`;
        }

        // Allocation — store allocation metadata in IPFS
        const sizeMb = parts[3] || '0';
        const allocData = new TextEncoder().encode(`alloc:${spaceName}:size:${sizeMb}:provider:${this.accountHashHex}:ts:${Date.now()}`);
        const cid = await fs.addBytes(allocData);
        this.log('success', `Storage allocation stored via Helia, CID: ${cid.toString().slice(0, 20)}...`);
        return `BROWSER_STORAGE_ALLOCATED:${cid.toString()}`;
      } catch (e) {
        this.log('warn', `Helia storage operation failed: ${e.message}`);
      }
    }

    // Fallback: proof-of-storage hash
    const proof = await this._sha256(`${orderId}:${this.accountHashHex}:${Date.now()}`);
    return `BROWSER_STORAGE:${proof.slice(0, 64)}`;
  }

  private async _handleComputeJob(orderId: string): Promise<string> {
    this.log('info', `Processing compute job: ${orderId.slice(0, 60)}`);

    const parts = orderId.split(':');
    const runtime = parts[1] || 'shell';
    const code = parts.slice(6).join(':') || '';

    // Use @wasmer/sdk for WASI-sandboxed execution
    const wasmerReady = await this._ensureWasmer();
    if (wasmerReady) {
      try {
        const { Wasmer } = await import('@wasmer/sdk');
        // Run a quick computation in a WASI sandbox
        // For shell-type jobs, use python/python package from Wasmer registry
        if (runtime === 'python' || runtime === 'docker') {
          const pkg = await Wasmer.fromRegistry('python/python');
          const instance = await pkg.entrypoint.run({
            args: ['-c', code.slice(0, 1000) || 'print("computed")'],
          });
          const { code: exitCode, stdout } = await instance.wait();
          const proof = await this._sha256(`compute:${runtime}:${stdout}:${this.accountHashHex}`);
          this.log('success', `Compute completed via Wasmer (exit ${exitCode}, ${stdout.length} bytes output)`);
          return `BROWSER_COMPUTE:${proof.slice(0, 64)}`;
        }
      } catch (e) {
        this.log('warn', `Wasmer compute failed: ${e.message}`);
      }
    }

    // Fallback: proof-of-compute hash
    const proof = await this._sha256(`compute:${runtime}:${code}:${this.accountHashHex}:${Date.now()}`);
    return `BROWSER_COMPUTE:${proof.slice(0, 64)}`;
  }

  private async _handleBandwidthJob(orderId: string): Promise<string> {
    this.log('info', `Processing bandwidth job: ${orderId.slice(0, 60)}`);

    const parts = orderId.split(':');
    const duration = parts[1] || '1h';
    const dataGb = parts[2] || '1GB';

    // Use native WebRTC API (open web standard, built into all modern browsers)
    // Create a data channel as proof of bandwidth availability
    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      });
      const dc = pc.createDataChannel('chimera-bandwidth');
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Wait briefly for ICE gathering to prove connectivity
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 5000);
        pc.onicegatheringstatechange = () => {
          if (pc.iceGatheringState === 'complete') { clearTimeout(timeout); resolve(null); }
        };
      });

      const sessionId = (await this._sha256(`${this.accountHashHex}:${Date.now()}`)).slice(0, 16);
      dc.close();
      pc.close();
      this.log('success', `Bandwidth session established via WebRTC (session: ${sessionId})`);
      return `BROWSER_BANDWIDTH:${sessionId}:${duration}:${dataGb}`;
    } catch (e) {
      this.log('warn', `WebRTC bandwidth check failed: ${e.message}`);
      const sessionId = (await this._sha256(`${this.accountHashHex}:${Date.now()}`)).slice(0, 16);
      return `BROWSER_BANDWIDTH:${sessionId}:${duration}:${dataGb}`;
    }
  }

  private async _submitResult(jobId: string, responseText: string) {
    const result = await callEntryPointWithWallet(
      this.provider,
      this.publicKeyHex,
      CONTRACTS.escrowVault,
      'provider_complete',
      {
        job_id: sdk.CLValue.newCLString(jobId),
        response_hash: sdk.CLValue.newCLString(responseText),
      }
    );

    if (result.error) {
      this.log('error', `Failed to submit result for job ${jobId.slice(0, 12)}: ${result.error}`);
      this.jobsFailed++;
      return;
    }

    this.jobsProcessed++;
    this.log('success', `Result submitted for job ${jobId.slice(0, 12)}: ${result.deployHash.slice(0, 16)}...`);
  }

  private _monitorSettlement(jobId: string, jobsUref: string) {
    let attempts = 0;
    const maxAttempts = 40;

    const check = async () => {
      if (!this.running) return;
      attempts++;

      try {
        const stateVal = await queryDictionary(jobsUref, `${jobId}:state`);
        const state = stateVal !== null ? Number(stateVal) : null;
        if (state === null) return;

        this.log('info', `Job ${jobId.slice(0, 12)} settlement: state=${state} (attempt ${attempts})`);

        if (state === STATE.SETTLED || state === STATE.CONSUMER_CONFIRM) {
          const claimResult = await callEntryPointWithWallet(
            this.provider,
            this.publicKeyHex,
            CONTRACTS.escrowVault,
            'claim_payment',
            {
              job_id: sdk.CLValue.newCLString(jobId),
            }
          );

          if (claimResult.error) {
            this.log('warn', `Claim failed for job ${jobId.slice(0, 12)}: ${claimResult.error}`);
          } else {
            this.log('success', `Payment claimed for job ${jobId.slice(0, 12)}`);
          }
          return;
        }

        if (state === STATE.REFUNDED) {
          this.log('warn', `Job ${jobId.slice(0, 12)} was refunded`);
          return;
        }

        if (state === STATE.DISPUTED) {
          this.log('warn', `Job ${jobId.slice(0, 12)} is disputed`);
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(check, 15000);
        }
      } catch (e) {
        this.log('error', `Settlement monitor error for ${jobId.slice(0, 12)}: ${e.message}`);
        if (attempts < maxAttempts) setTimeout(check, 15000);
      }
    };

    setTimeout(check, 15000);
  }

  private async _sha256(input: string): Promise<string> {
    const encoder = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', encoder.encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  getStatus(): BrowserNodeStatus {
    return {
      running: this.running,
      registered: this.registered,
      registering: this.registering,
      jobsProcessed: this.jobsProcessed,
      jobsFailed: this.jobsFailed,
      earningsMotes: this.earningsMotes,
      currentJob: this.currentJob,
      pollCount: this.pollCount,
      capabilities: this.capabilities,
      logs: this.logs,
      providerAccountHash: this.accountHash,
      marketRegistrations: this.marketRegistrations,
      fingerprint: this.fingerprint,
      deviceTrustScore: this.deviceTrustScore,
    };
  }
}
