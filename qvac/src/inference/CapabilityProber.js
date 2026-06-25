import { Logger } from '../core/Logger.js';
import os from 'os';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * CapabilityProber — auto-detects hardware and benchmarks model tiers.
 *
 * Inspired by Conduit's `conduit bench`: a node learns what it can sell by
 * benchmarking its own hardware. The prober detects backend (CPU/GPU/Metal),
 * available RAM/VRAM, then loads each model tier and measures TTFT + TPS.
 * Based on results, it determines the sellable offer tier.
 *
 * Probe sequence:
 *   1. Detect backend + memory (CPU cores, RAM, GPU if available)
 *   2. Load smallest model → short completion → measure TPS
 *   3. If TPS ≥ bar, try next tier up
 *   4. Stop when a model fails to load or TPS drops below threshold
 *   5. Write capability profile + pricing policy
 *
 * Offer tiers:
 *   - buyer-only: can't sell (too slow)
 *   - tier-1.7B: small models (~1B params)
 *   - tier-4B: medium models (~4B params)
 *   - tier-7B: large models (~7B params, needs 24GB+)
 */

const DEFAULT_TPS_BAR = 10; // minimum tokens/sec to be sellable
const BENCH_PROMPT = 'Explain what a stablecoin is in two sentences.';
const BENCH_MAX_TOKENS = 64;

const MODEL_TIERS = [
  { name: 'qwen3-0.6b', tier: 'router', minRam: 512, label: '0.6B' },
  { name: 'llama-3.2-1b', tier: 'tier-1b', minRam: 1024, label: '1B' },
  { name: 'qwen3-1.7b', tier: 'tier-1.7b', minRam: 2048, label: '1.7B' },
  { name: 'qwen3-4b', tier: 'tier-4b', minRam: 4096, label: '4B' },
  { name: 'qwen3-7b', tier: 'tier-7b', minRam: 8192, label: '7B' },
];

export class CapabilityProber {
  constructor(config = {}) {
    this.logger = new Logger('CapabilityProber');
    this.enabled = config.enabled !== false;
    this.tpsBar = config.tpsBar || DEFAULT_TPS_BAR;
    this.benchPrompt = config.benchPrompt || BENCH_PROMPT;
    this.benchMaxTokens = config.benchMaxTokens || BENCH_MAX_TOKENS;
    this.outputPath = config.outputPath || path.join(process.cwd(), 'data', 'bench-profile.json');
    this._profile = null;
    this._inferenceLayer = null;
    this._modelRegistry = null;
    this._stats = {
      totalProbes: 0,
      lastProbeAt: 0,
    };
  }

  setInferenceLayer(layer) {
    this._inferenceLayer = layer;
  }

  setModelRegistry(registry) {
    this._modelRegistry = registry;
  }

  /**
   * Detect hardware capabilities.
   */
  async _detectHardware() {
    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    let backend = 'cpu';
    let gpuInfo = null;

    // Try to detect GPU via environment
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      // Check for NVIDIA GPU
      try {
        const { stdout } = await execAsync('nvidia-smi --query-gpu=name,memory.total --format=csv,noheader', { timeout: 5000 });
        if (stdout.trim()) {
          const [name, memStr] = stdout.trim().split(',').map(s => s.trim());
          const vram = parseInt(memStr, 10);
          backend = 'gpu';
          gpuInfo = { vendor: 'nvidia', name, vramMB: vram };
        }
      } catch {}

      // Check for Apple Metal
      if (backend === 'cpu' && process.platform === 'darwin') {
        try {
          const { stdout } = await execAsync('system_profiler SPDisplaysDataType -json', { timeout: 5000 });
          const data = JSON.parse(stdout);
          const gpu = data?.SPDisplaysDataType?.[0];
          if (gpu?.sppci_model) {
            backend = 'metal';
            gpuInfo = { vendor: 'apple', name: gpu.sppci_model };
          }
        } catch {}
      }

      // Check for Vulkan
      if (backend === 'cpu') {
        try {
          await execAsync('vulkaninfo --summary', { timeout: 5000 });
          backend = 'vulkan';
          gpuInfo = { vendor: 'unknown', name: 'Vulkan device' };
        } catch {}
      }
    } catch {}

    return {
      backend,
      gpu: gpuInfo,
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model || 'unknown',
        speed: cpus[0]?.speed || 0,
      },
      memory: {
        totalMB: Math.round(totalMem / 1024 / 1024),
        freeMB: Math.round(freeMem / 1024 / 1024),
      },
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    };
  }

  /**
   * Benchmark a single model tier.
   */
  async _benchmarkTier(modelName) {
    if (!this._inferenceLayer) {
      return { loaded: false, error: 'no inference layer' };
    }

    const start = Date.now();
    try {
      // Run a short completion
      const result = await this._inferenceLayer.handleInferenceRequest({
        prompt: this.benchPrompt,
        maxTokens: this.benchMaxTokens,
        temperature: 0.3,
        source: `capability-prober-${modelName}`,
        model: modelName,
      });

      const elapsed = Date.now() - start;
      const output = result.output || '';
      const tokens = result.tokensGenerated || output.split(/\s+/).length;
      const tps = elapsed > 0 ? (tokens / elapsed) * 1000 : 0;
      const ttft = result.ttftMs || elapsed / 2;

      return {
        loaded: true,
        model: modelName,
        tps: Math.round(tps * 10) / 10,
        ttftMs: Math.round(ttft * 10) / 10,
        tokensGenerated: tokens,
        elapsedMs: elapsed,
        output: output.slice(0, 100),
      };
    } catch (e) {
      return { loaded: false, model: modelName, error: e.message, elapsedMs: Date.now() - start };
    }
  }

  /**
   * Run a full capability probe.
   * Detects hardware, benchmarks each model tier, determines sellable offer.
   */
  async probe() {
    if (!this.enabled) return null;
    this._stats.totalProbes++;
    this._stats.lastProbeAt = Date.now();

    this.logger.info('Starting capability probe...');

    // 1. Detect hardware
    const hardware = await this._detectHardware();
    this.logger.info(`Detected: backend=${hardware.backend}, cores=${hardware.cpu.cores}, RAM=${hardware.memory.totalMB}MB`);

    // 2. Benchmark each tier
    const tierResults = [];
    let sellableTier = 'buyer-only';
    let bestModel = null;
    let bestTps = 0;

    for (const tier of MODEL_TIERS) {
      // Skip if not enough RAM
      if (hardware.memory.totalMB < tier.minRam) {
        tierResults.push({ ...tier, loaded: false, skipped: 'insufficient_ram' });
        continue;
      }

      this.logger.info(`Benchmarking ${tier.label} (${tier.name})...`);
      const result = await this._benchmarkTier(tier.name);
      tierResults.push({ ...tier, ...result });

      if (result.loaded && result.tps >= this.tpsBar) {
        sellableTier = tier.tier;
        bestModel = tier.name;
        bestTps = result.tps;
        this.logger.info(`  ✓ ${tier.label}: ${result.tps} tok/s — sellable`);
      } else if (result.loaded) {
        this.logger.info(`  ✗ ${tier.label}: ${result.tps} tok/s — below bar (${this.tpsBar})`);
        break; // Stop probing higher tiers
      } else {
        this.logger.info(`  ✗ ${tier.label}: failed to load — ${result.error}`);
        break;
      }
    }

    // 3. Build profile
    const profile = {
      probedAt: Date.now(),
      hardware,
      tiers: tierResults,
      offer: {
        tier: sellableTier,
        model: bestModel,
        tps: bestTps,
        sellable: sellableTier !== 'buyer-only',
      },
      pricing: this._computePricing(sellableTier, bestTps),
      tpsBar: this.tpsBar,
    };

    this._profile = profile;

    // 4. Write profile to disk
    try {
      await fs.mkdir(path.dirname(this.outputPath), { recursive: true });
      await fs.writeFile(this.outputPath, JSON.stringify(profile, null, 2));
      this.logger.info(`Profile written to ${this.outputPath}`);
    } catch (e) {
      this.logger.warn(`Failed to write profile: ${e.message}`);
    }

    // 5. Register in model registry
    if (this._modelRegistry && bestModel) {
      this._modelRegistry.register({
        name: bestModel,
        type: 'llm',
        contextLength: 4096,
        quantization: 'q4',
        loaded: true,
        benchmarked: true,
        tps: bestTps,
        tier: sellableTier,
      });
    }

    this.logger.info(`Probe complete: offer=${sellableTier}, model=${bestModel}, tps=${bestTps}`);
    return profile;
  }

  /**
   * Compute pricing policy based on tier and TPS.
   */
  _computePricing(tier, tps) {
    if (tier === 'buyer-only') return null;

    const basePrices = {
      'tier-1b': 0.001,    // 0.001 USDT per 1K tokens
      'tier-1.7b': 0.002,
      'tier-4b': 0.005,
      'tier-7b': 0.01,
    };

    const base = basePrices[tier] || 0.002;
    // Faster TPS = slight premium
    const speedMultiplier = tps > 50 ? 1.2 : tps > 20 ? 1.0 : 0.8;

    return {
      per1kTokens: Math.round(base * speedMultiplier * 10000) / 10000,
      perInference: Math.round(base * speedMultiplier * 0.5 * 10000) / 10000,
      currency: 'USDT',
      tier,
    };
  }

  /**
   * Get the current profile (runs probe if not yet probed).
   */
  async getProfile() {
    if (!this._profile) return await this.probe();
    return this._profile;
  }

  /**
   * Check if this node can sell inference.
   */
  canSell() {
    return this._profile?.offer?.sellable || false;
  }

  /**
   * Get the sellable offer.
   */
  getOffer() {
    return this._profile?.offer || null;
  }

  getStats() {
    return {
      enabled: this.enabled,
      totalProbes: this._stats.totalProbes,
      lastProbeAt: this._stats.lastProbeAt,
      hasProfile: !!this._profile,
      sellable: this.canSell(),
      offer: this._profile?.offer || null,
      pricing: this._profile?.pricing || null,
      backend: this._profile?.hardware?.backend || 'unknown',
    };
  }
}
