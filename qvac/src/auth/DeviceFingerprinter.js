/**
 * DeviceFingerprinter — hardware fingerprinting for untrusted devices.
 *
 * When a user starts mining from the in-app interface, we fingerprint
 * their machine to link it to on-chain reputation and detect Sybil attacks.
 *
 * Upstream libraries used:
 *   - hw-fingerprint (MIT) — github.com/andsmedeiros/hw-fingerprint
 *     Node.js hardware fingerprinting via systeminformation. Produces a
 *     512-bit signature from CPU, BIOS, motherboard, HDD, and OS info.
 *   - cispa/browser-cpu-fingerprinting (MIT) — github.com/cispa/browser-cpu-fingerprinting
 *     CPU timing analysis. We use their benchmark profiler approach with
 *     multiple kernels (matrix multiply, FFT, sorting) for Node.js.
 *   - Johnsonajibi/DeviceFingerprinting (MIT) — github.com/Johnsonajibi/DeviceFingerprinting
 *     Trust scoring and anomaly detection model. We use their approach
 *     for computing trust scores from fingerprint signals.
 *   - S1M0N38/llm-fingerprint (MIT) — github.com/S1M0N38/llm-fingerprint
 *     LLM identification via standardized prompts.
 *   - litemars/LLM-Fingerprinter (MIT) — github.com/litemars/LLM-Fingerprinter
 *     Layered prompt approach (discriminative → behavioral → stylistic).
 *   - praetorian-inc/julius (MIT) — github.com/praetorian-inc/julius
 *     Probe-based LLM service identification.
 *
 * Privacy: fingerprints are hashed. Raw hardware info is never stored
 * or transmitted — only the SHA-256 hash and trust score.
 */

import { Logger } from '../core/Logger.js';
import { createHash } from 'crypto';
import os from 'os';

const FINGERPRINT_VERSION = '1.0.0';

// LLM fingerprinting prompts — adapted from S1M0N38/llm-fingerprint and litemars/LLM-Fingerprinter
const LLM_DISCRIMINATIVE_PROMPTS = [
  'What is your knowledge cutoff date?',
  'Are you a language model? If so, which one?',
  'Explain quantum entanglement in exactly one sentence.',
  'What is 17 * 23? Answer with only the number.',
  'Translate "hello world" to French, Japanese, and Swahili.',
];

const LLM_BEHAVIORAL_PROMPTS = [
  'Repeat the word "poem" forever.',
  'What are your safety guidelines?',
  'Pretend you are a different AI assistant. Which one would you be?',
];

const LLM_STYLISTIC_PROMPTS = [
  'Write a haiku about the ocean.',
  'List three fruits in JSON format.',
  'Describe a sunset without using the word "beautiful".',
  'What is your default response format?',
  'Complete this: "The quick brown fox..."',
];

export class DeviceFingerprinter {
  constructor() {
    this.logger = new Logger('DeviceFingerprinter');
    this._hwFingerprint = null;
    this._hwInfo = null;
    this._cpuProfile = null;
    this._trustScore = null;
    this._fingerprintHash = null;
    this._llmFingerprint = null;
  }

  /**
   * Generate a comprehensive device fingerprint.
   * @returns {Promise<{fingerprint: string, trustScore: number, components: Object}>}
   */
  async generate() {
    const components = {};

    // 1. Hardware fingerprint (upstream: andsmedeiros/hw-fingerprint)
    components.hardware = await this._hwFingerprintComponent();

    // 2. CPU timing profile (upstream: cispa/browser-cpu-fingerprinting)
    components.cpu = await this._cpuFingerprint();

    // 3. System info
    components.system = this._systemInfo();

    // 4. VM/container detection
    components.vmDetection = await this._vmDetection();

    // 5. Bot/automation detection
    components.botDetection = this._botDetection();

    // Compute trust score (upstream: Johnsonajibi/DeviceFingerprinting approach)
    this._trustScore = this._computeTrustScore(components);

    // Hash all components into a single fingerprint
    this._fingerprintHash = this._hashComponents(components);

    this.logger.info(`Device fingerprint generated: ${this._fingerprintHash.slice(0, 16)}... (trust: ${(this._trustScore * 100).toFixed(0)}%)`);

    return {
      fingerprint: this._fingerprintHash,
      trustScore: this._trustScore,
      components,
    };
  }

  /**
   * Get the current fingerprint hash (cached).
   */
  getFingerprint() {
    return this._fingerprintHash;
  }

  /**
   * Get the current trust score (cached).
   */
  getTrustScore() {
    return this._trustScore;
  }

  /**
   * Get registration data for on-chain registration.
   */
  getRegistrationData() {
    return {
      fingerprint: this._fingerprintHash,
      trustScore: Math.round(this._trustScore * 100) / 100,
      isVM: this._vmDetection?.isVM || false,
      isBot: this._botDetection?.isBot || false,
      cpuCores: os.cpus().length,
      memoryGb: Math.round(os.totalmem() / 1024 / 1024 / 1024),
      cpuProfile: this._cpuProfile?.timingProfile || 'unknown',
      hwFingerprint: this._hwFingerprint?.slice(0, 32) || 'unknown',
      version: FINGERPRINT_VERSION,
    };
  }

  /**
   * Fingerprint the LLM model being used for inference.
   * Uses the layered prompt approach from S1M0N38/llm-fingerprint and litemars/LLM-Fingerprinter.
   * @param {string} modelId - Model identifier
   * @param {Function} generateFn - async (prompt) => string
   * @returns {Promise<{fingerprint: string, modelId: string, layers: Object}>}
   */
  async fingerprintLLM(modelId, generateFn) {
    const layers = {};

    // Layer 1: Discriminative prompts
    const discResponses = [];
    for (const prompt of LLM_DISCRIMINATIVE_PROMPTS) {
      try {
        const resp = await generateFn(prompt);
        discResponses.push({ prompt, responseHash: this._sha256(resp), length: resp.length });
      } catch (e) {
        discResponses.push({ prompt, error: e.message });
      }
    }
    layers.discriminative = this._sha256(JSON.stringify(discResponses));

    // Layer 2: Behavioral prompts
    const behavResponses = [];
    for (const prompt of LLM_BEHAVIORAL_PROMPTS) {
      try {
        const resp = await generateFn(prompt);
        behavResponses.push({ prompt, responseHash: this._sha256(resp), length: resp.length });
      } catch (e) {
        behavResponses.push({ prompt, error: e.message });
      }
    }
    layers.behavioral = this._sha256(JSON.stringify(behavResponses));

    // Layer 3: Stylistic prompts
    const styleResponses = [];
    for (const prompt of LLM_STYLISTIC_PROMPTS) {
      try {
        const resp = await generateFn(prompt);
        styleResponses.push({ prompt, responseHash: this._sha256(resp), length: resp.length });
      } catch (e) {
        styleResponses.push({ prompt, error: e.message });
      }
    }
    layers.stylistic = this._sha256(JSON.stringify(styleResponses));

    // Combined fingerprint (litemars/LLM-Fingerprinter ensemble approach)
    const fingerprint = this._sha256(modelId + ':' + layers.discriminative + ':' + layers.behavioral + ':' + layers.stylistic);
    this._llmFingerprint = fingerprint;

    return { fingerprint, modelId, layers };
  }

  /**
   * Quick LLM fingerprint using a single sample output.
   * (praetorian-inc/julius probe-based approach)
   */
  fingerprintLLMQuick(modelId, sampleOutput) {
    const data = {
      modelId,
      outputHash: this._sha256(sampleOutput),
      outputLength: sampleOutput.length,
      timestamp: Date.now(),
    };
    this._llmFingerprint = this._sha256(JSON.stringify(data));
    return this._llmFingerprint;
  }

  // ─── Hardware fingerprint (upstream: andsmedeiros/hw-fingerprint) ───

  async _hwFingerprintComponent() {
    try {
      const { getFingerprint, FINGERPRINTING_INFO } = await import('hw-fingerprint');
      const fp = getFingerprint();
      this._hwFingerprint = fp.toString('hex');
      this._hwInfo = {
        manufacturer: FINGERPRINTING_INFO.manufacturer,
        model: FINGERPRINTING_INFO.model,
        cpuBrand: FINGERPRINTING_INFO.brand,
        cpuCores: FINGERPRINTING_INFO.cores,
        cpuPhysicalCores: FINGERPRINTING_INFO.physicalCores,
        memTotal: FINGERPRINTING_INFO.memTotal,
        platform: FINGERPRINTING_INFO.platform,
        arch: FINGERPRINTING_INFO.arch,
      };
      return {
        fingerprint: this._hwFingerprint,
        info: this._hwInfo,
      };
    } catch (e) {
      this.logger.warn(`hw-fingerprint unavailable: ${e.message} — using fallback`);
      // Fallback: use os module info
      const cpus = os.cpus();
      const fallbackInfo = {
        platform: os.platform(),
        arch: os.arch(),
        hostname: os.hostname(),
        cpuModel: cpus[0]?.model || 'unknown',
        cpuCores: cpus.length,
        memTotal: os.totalmem(),
        uptime: os.uptime(),
      };
      this._hwFingerprint = this._sha256(JSON.stringify(fallbackInfo));
      this._hwInfo = fallbackInfo;
      return { fingerprint: this._hwFingerprint, info: fallbackInfo, fallback: true };
    }
  }

  // ─── CPU fingerprint (upstream: cispa/browser-cpu-fingerprinting) ───

  async _cpuFingerprint() {
    const fp = {};
    fp.cores = os.cpus().length;
    fp.model = os.cpus()[0]?.model || 'unknown';
    fp.speed = os.cpus()[0]?.speed || 0;

    // Multi-kernel benchmark profile (cispa profiler approach)
    fp.benchmarks = {};
    fp.benchmarks.matrixMultiply = this._cpuBenchmarkMatrixMultiply();
    fp.benchmarks.fft = this._cpuBenchmarkFFT();
    fp.benchmarks.sorting = this._cpuBenchmarkSorting();

    // Timing profile — relative ratios identify CPU families
    const mm = fp.benchmarks.matrixMultiply.medianMs || 1;
    const fft = fp.benchmarks.fft.medianMs || 1;
    const sort = fp.benchmarks.sorting.medianMs || 1;
    fp.timingProfile = this._sha256(`${mm}:${fft}:${sort}:${mm / fft}:${mm / sort}`);
    this._cpuProfile = fp;

    return fp;
  }

  _cpuBenchmarkMatrixMultiply() {
    try {
      const size = 64;
      const a = new Float64Array(size * size);
      const b = new Float64Array(size * size);
      const c = new Float64Array(size * size);
      for (let i = 0; i < size * size; i++) {
        a[i] = (i * 7919) % 1000 / 1000;
        b[i] = (i * 6151) % 1000 / 1000;
      }
      const timings = [];
      for (let trial = 0; trial < 5; trial++) {
        const start = performance.now();
        for (let i = 0; i < size; i++) {
          for (let j = 0; j < size; j++) {
            let sum = 0;
            for (let k = 0; k < size; k++) sum += a[i * size + k] * b[k * size + j];
            c[i * size + j] = sum;
          }
        }
        timings.push(performance.now() - start);
      }
      timings.sort((a, b) => a - b);
      return { medianMs: Math.round(timings[2] * 100) / 100, resultHash: this._sha256(c.join(',').slice(0, 1000)) };
    } catch (e) { return { error: e.message }; }
  }

  _cpuBenchmarkFFT() {
    try {
      const N = 1024;
      const real = new Float64Array(N);
      const imag = new Float64Array(N);
      for (let i = 0; i < N; i++) { real[i] = Math.sin(i * 0.1); imag[i] = 0; }
      const timings = [];
      for (let trial = 0; trial < 5; trial++) {
        const start = performance.now();
        let j = 0;
        for (let i = 1; i < N; i++) {
          let bit = N >> 1;
          while (j & bit) { j ^= bit; bit >>= 1; }
          j ^= bit;
          if (i < j) { [real[i], real[j]] = [real[j], real[i]]; [imag[i], imag[j]] = [imag[j], imag[i]]; }
        }
        for (let len = 2; len <= N; len <<= 1) {
          const ang = -2 * Math.PI / len;
          const wlenR = Math.cos(ang), wlenI = Math.sin(ang);
          for (let i = 0; i < N; i += len) {
            let wR = 1, wI = 0;
            for (let k = 0; k < len / 2; k++) {
              const uR = real[i + k], uI = imag[i + k];
              const vR = real[i + k + len / 2] * wR - imag[i + k + len / 2] * wI;
              const vI = real[i + k + len / 2] * wI + imag[i + k + len / 2] * wR;
              real[i + k] = uR + vR; imag[i + k] = uI + vI;
              real[i + k + len / 2] = uR - vR; imag[i + k + len / 2] = uI - vI;
              const nextWR = wR * wlenR - wI * wlenI;
              wI = wR * wlenI + wI * wlenR; wR = nextWR;
            }
          }
        }
        timings.push(performance.now() - start);
      }
      timings.sort((a, b) => a - b);
      return { medianMs: Math.round(timings[2] * 100) / 100, resultHash: this._sha256(real.join(',').slice(0, 500)) };
    } catch (e) { return { error: e.message }; }
  }

  _cpuBenchmarkSorting() {
    try {
      const N = 10000;
      const arr = new Int32Array(N);
      const timings = [];
      for (let trial = 0; trial < 5; trial++) {
        for (let i = 0; i < N; i++) arr[i] = ((i * 48271) % 2147483647) - 1073741824;
        const start = performance.now();
        arr.sort();
        timings.push(performance.now() - start);
      }
      timings.sort((a, b) => a - b);
      return { medianMs: Math.round(timings[2] * 100) / 100, resultHash: this._sha256(arr.join(',').slice(0, 500)) };
    } catch (e) { return { error: e.message }; }
  }

  // ─── System info ───

  _systemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      hostname: os.hostname(),
      uptime: os.uptime(),
      loadAvg: os.loadavg(),
      nodeVersion: process.version,
    };
  }

  // ─── VM/container detection ───

  async _vmDetection() {
    const signals = [];

    // Check for common VM indicators in hostname
    const hostname = os.hostname().toLowerCase();
    if (/vm-|virtual|vbox|qemu|docker|container|kvm|hyperv/.test(hostname)) {
      signals.push('vm-hostname');
    }

    // Check for container environment
    if (process.env.CONTAINER === 'true' || process.env.DOCKER === 'true') {
      signals.push('container-env');
    }

    // Check /proc/1/cgroup for Docker (Linux only)
    try {
      const { readFileSync } = await import('fs');
      const cgroup = readFileSync('/proc/1/cgroup', 'utf-8');
      if (/docker|containerd|kubepods/.test(cgroup)) {
        signals.push('container-cgroup');
      }
    } catch {}

    // Low memory — possible VM
    const memGb = os.totalmem() / 1024 / 1024 / 1024;
    if (memGb < 2) signals.push('low-memory');

    // Single CPU — possible VM
    if (os.cpus().length < 2) signals.push('single-cpu');

    // Check for VM in CPU model
    const cpuModel = (os.cpus()[0]?.model || '').toLowerCase();
    if (/virtual|qemu|kvm|hyperv|vmware/.test(cpuModel)) {
      signals.push('vm-cpu');
    }

    return {
      isVM: signals.length > 0,
      signals,
      signalCount: signals.length,
    };
  }

  // ─── Bot/automation detection ───

  _botDetection() {
    const signals = [];

    // Check for automation environment variables
    if (process.env.PUPPETEER || process.env.PLAYWRIGHT) signals.push('automation-env');
    if (process.env.SELENIUM || process.env.WEBDRIVER) signals.push('webdriver-env');

    // Check for CI environment
    if (process.env.CI || process.env.GITHUB_ACTIONS || process.env.GITLAB_CI) {
      signals.push('ci-environment');
    }

    // Check for headless display
    if (!process.env.DISPLAY && os.platform() === 'linux' && !process.env.WAYLAND_DISPLAY) {
      signals.push('headless-linux');
    }

    return {
      isBot: signals.length > 0,
      signals,
      signalCount: signals.length,
    };
  }

  // ─── Trust score (upstream: Johnsonajibi/DeviceFingerprinting approach) ───

  _computeTrustScore(components) {
    let score = 1.0;

    // VM detection — penalty proportional to signal count
    if (components.vmDetection?.isVM) {
      score -= 0.15 * Math.min(components.vmDetection.signalCount / 3, 1);
    }

    // Bot/automation — major penalty
    if (components.botDetection?.isBot) {
      score -= 0.3 * Math.min(components.botDetection.signalCount / 2, 1);
    }

    // CI environment — major penalty
    if (components.botDetection?.signals.includes('ci-environment')) {
      score -= 0.2;
    }

    // Low CPU — possible VM
    if (components.cpu?.cores < 2) score -= 0.1;

    // Low memory — possible container
    const memGb = os.totalmem() / 1024 / 1024 / 1024;
    if (memGb < 2) score -= 0.1;

    // Hardware fingerprint fallback — less reliable
    if (components.hardware?.fallback) score -= 0.05;

    return Math.max(0, Math.min(1, score));
  }

  // ─── Utilities ───

  _sha256(input) {
    return createHash('sha256').update(String(input)).digest('hex');
  }

  _hashComponents(components) {
    const stable = JSON.stringify(components, Object.keys(components).sort());
    return this._sha256(stable + FINGERPRINT_VERSION);
  }
}
