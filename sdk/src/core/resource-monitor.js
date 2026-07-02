/**
 * ResourceMonitor — unified resource monitoring for Chimera SDK.
 *
 * Monitors CPU, memory, storage, and bandwidth. Pauses providers before
 * they affect the machine's function.
 *
 * Machine apps (Node.js):
 *   - CPU/RAM: `system-resource-monitor` (open source, MIT, zero deps)
 *     Fallback: `os` module (loadavg, freemem)
 *   - Storage: `fs.statfs` (Node 18+ built-in) — disk usage of data dir
 *   - Bandwidth: reads `/proc/net/dev` (Linux) or `netstat -ib` (macOS)
 *     to measure throughput. Fallback: no bandwidth monitoring.
 *
 * Browser apps:
 *   - CPU: PerformanceObserver long-task detection (W3C standard)
 *   - Memory: `performance.memory` (Chrome) or `navigator.deviceMemory`
 *   - Storage: `navigator.storage.estimate()` (Storage API)
 *   - Bandwidth: `navigator.connection` (Network Information API)
 *
 * Thresholds (configurable):
 *   - cpuPausePercent: 80  — pause providers when CPU exceeds this
 *   - cpuResumePercent: 60  — resume providers when CPU drops below this
 *   - memPausePercent: 85  — pause when memory usage exceeds this
 *   - memResumePercent: 70  — resume when memory drops below this
 *   - diskPausePercent: 90  — pause when disk usage exceeds this
 *   - diskResumePercent: 80  — resume when disk drops below this
 *   - bandwidthPausePercent: 85  — pause when bandwidth utilization exceeds this
 *   - bandwidthResumePercent: 60  — resume when bandwidth drops below this
 *   - browserCpuPausePercent: 70  — stricter for browser (less headroom)
 *   - browserCpuResumePercent: 50
 *   - browserDiskPausePercent: 85
 *   - browserDiskResumePercent: 70
 *   - browserBandwidthPauseMbps: 2  — pause if effective bandwidth below this
 *   - browserBandwidthResumeMbps: 5
 *
 * Upstream: https://github.com/pfaciana/system-resource-monitor
 */

const DEFAULT_THRESHOLDS = {
  cpuPausePercent: 80,
  cpuResumePercent: 60,
  memPausePercent: 85,
  memResumePercent: 70,
  diskPausePercent: 90,
  diskResumePercent: 80,
  bandwidthPausePercent: 85,
  bandwidthResumePercent: 60,
  browserCpuPausePercent: 70,
  browserCpuResumePercent: 50,
  browserMemPausePercent: 80,
  browserMemResumePercent: 60,
  browserDiskPausePercent: 85,
  browserDiskResumePercent: 70,
  browserBandwidthPauseMbps: 2,
  browserBandwidthResumeMbps: 5,
  pollIntervalMs: 5000,
};

const isBrowser = typeof window !== 'undefined' && typeof navigator !== 'undefined';

// Node.js built-ins — only loaded in Node, not browser
let _os, _path;
if (!isBrowser) {
  // Use createRequire for ESM compatibility, fallback to global require
  try {
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);
    _os = require('os');
    _path = require('path');
  } catch {
    _os = globalThis.require?.('os');
    _path = globalThis.require?.('path');
  }
}

export class ResourceMonitor {
  constructor(thresholds = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    this.running = false;
    this.paused = false;
    this.listeners = new Set();
    this._timer = null;
    this._cpuProfiling = false;
    this._lastSnapshot = null;
    this._perfObserver = null;
    this._longTaskCount = 0;
    this._prevNetBytes = null;
    this._prevNetTime = null;
    this._dataDir = null;
  }

  /**
   * Start monitoring. Calls onThrottle/onResume callbacks when thresholds
   * are crossed.
   */
  async start() {
    if (this.running) return;
    this.running = true;

    if (!isBrowser) {
      await this._startNode();
    } else {
      this._startBrowser();
    }
  }

  async stop() {
    this.running = false;
    this.paused = false;
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
    if (!isBrowser && this._cpuProfiling) {
      try {
        const { stopProfilingCpu } = await import('system-resource-monitor');
        stopProfilingCpu();
        this._cpuProfiling = false;
      } catch {}
    }
    if (this._perfObserver) {
      try { this._perfObserver.disconnect(); } catch {}
      this._perfObserver = null;
    }
  }

  /**
   * Subscribe to throttle events.
   * @param {(event: {type: 'throttle'|'resume', reason: string, snapshot: object}) => void} fn
   * @returns {() => void} unsubscribe
   */
  onEvent(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Get the latest resource snapshot.
   */
  getSnapshot() {
    return this._lastSnapshot;
  }

  /**
   * Check if providers should currently be paused.
   */
  shouldPause() {
    return this.paused;
  }

  // ─── Node.js monitoring via system-resource-monitor ───

  async _startNode() {
    try {
      const srm = await import('system-resource-monitor');
      if (srm.startProfilingCpu) {
        await srm.startProfilingCpu();
        this._cpuProfiling = true;
      }
      // Wrap the imported functions for easy access
      this._srm = srm;
    } catch (err) {
      // system-resource-monitor not installed — fall back to os module
      this._srm = null;
    }

    const poll = async () => {
      await this._pollNode();
    };
    await poll();
    this._timer = setInterval(poll, this.thresholds.pollIntervalMs);
  }

  async _pollNode() {
    let cpuPercent = 0;
    let memPercent = 0;
    let perThread = [];
    let totalCores = 0;
    let totalMemGB = 0;
    let usedMemGB = 0;

    if (this._srm) {
      try {
        cpuPercent = this._srm.getCpuUsage(true) || 0;
        memPercent = this._srm.getMemoryUsage(true) || 0;
        perThread = this._srm.getThreadUsage?.() || [];
        totalCores = this._srm.getPhysicalCoreCount?.() || 0;
        totalMemGB = this._srm.getTotalMemory?.(true) || 0;
        usedMemGB = this._srm.getUsedMemory?.(true) || 0;
      } catch {}
    } else {
      // Fallback: use os module
      const os = await import('os');
      totalCores = os.cpus().length;
      totalMemGB = os.totalmem() / (1024 ** 3);
      const freeMemGB = os.freemem() / (1024 ** 3);
      usedMemGB = totalMemGB - freeMemGB;
      memPercent = (usedMemGB / totalMemGB) * 100;

      // Estimate CPU from load average
      const loadAvg = os.loadavg()[0];
      cpuPercent = Math.min(100, (loadAvg / totalCores) * 100);
    }

    // Storage: disk usage of the Chimera data directory
    const diskInfo = await this._pollDiskNode();

    // Bandwidth: network throughput measurement
    const netInfo = await this._pollBandwidthNode();

    this._lastSnapshot = {
      platform: 'node',
      cpuPercent,
      memPercent,
      perThread,
      totalCores,
      totalMemGB,
      usedMemGB,
      diskPercent: diskInfo.diskPercent,
      diskTotalGB: diskInfo.diskTotalGB,
      diskUsedGB: diskInfo.diskUsedGB,
      bandwidthMbps: netInfo.bandwidthMbps,
      bandwidthPercent: netInfo.bandwidthPercent,
      timestamp: Date.now(),
    };

    this._checkThresholds(cpuPercent, memPercent, diskInfo.diskPercent, netInfo);
  }

  async _pollDiskNode() {
    // Use fs.statfs (Node 18+) to check disk usage of the data directory
    const checkDir = this._dataDir || (_path ? _path.join(_os?.homedir?.() || '/tmp', '.chimera') : '/tmp/.chimera');
    try {
      const fs = await import('fs');
      if (fs.statfs) {
        const stats = await fs.promises.statfs(checkDir);
        const totalBytes = stats.blocks * stats.bsize;
        const freeBytes = stats.bavail * stats.bsize;
        const usedBytes = totalBytes - freeBytes;
        const diskPercent = (usedBytes / totalBytes) * 100;
        return {
          diskPercent,
          diskTotalGB: totalBytes / (1024 ** 3),
          diskUsedGB: usedBytes / (1024 ** 3),
        };
      }
    } catch {}
    // Fallback: use child_process to run df
    try {
      const { execSync } = await import('child_process');
      const output = execSync(`df -B1 "${checkDir}"`, { encoding: 'utf-8' }).trim().split('\n');
      const parts = output[output.length - 1].split(/\s+/);
      const totalBytes = parseInt(parts[1], 10);
      const usedBytes = parseInt(parts[2], 10);
      return {
        diskPercent: (usedBytes / totalBytes) * 100,
        diskTotalGB: totalBytes / (1024 ** 3),
        diskUsedGB: usedBytes / (1024 ** 3),
      };
    } catch {}
    return { diskPercent: 0, diskTotalGB: 0, diskUsedGB: 0 };
  }

  async _pollBandwidthNode() {
    // Read network interface throughput from /proc/net/dev (Linux)
    // or netstat -ib (macOS). Measures total bytes/sec across interfaces.
    const now = Date.now();
    let totalBytes = 0;

    try {
      const fs = await import('fs');
      const platform = process.platform;

      if (platform === 'linux') {
        const data = await fs.promises.readFile('/proc/net/dev', 'utf-8');
        for (const line of data.split('\n').slice(2)) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 10) continue;
          const iface = parts[0].replace(':', '');
          // Skip loopback
          if (iface === 'lo') continue;
          const rxBytes = parseInt(parts[1], 10) || 0;
          const txBytes = parseInt(parts[9], 10) || 0;
          totalBytes += rxBytes + txBytes;
        }
      } else if (platform === 'darwin') {
        const { execSync } = await import('child_process');
        const data = execSync('netstat -ib', { encoding: 'utf-8' });
        for (const line of data.split('\n').slice(1)) {
          const parts = line.trim().split(/\s+/);
          if (parts.length < 11) continue;
          // Skip loopback
          if (parts[0] === 'lo0') continue;
          const rxBytes = parseInt(parts[6], 10) || 0;
          const txBytes = parseInt(parts[9], 10) || 0;
          totalBytes += rxBytes + txBytes;
        }
      }
    } catch {}

    let bandwidthMbps = 0;
    let bandwidthPercent = 0;

    if (this._prevNetBytes !== null && this._prevNetTime !== null) {
      const elapsedSec = (now - this._prevNetTime) / 1000;
      const bytesPerSec = (totalBytes - this._prevNetBytes) / elapsedSec;
      bandwidthMbps = (bytesPerSec * 8) / (1024 ** 2);
      // Estimate link capacity — assume 1000 Mbps default for wired, 100 for wifi
      // This is a rough heuristic; real capacity detection is OS-specific
      const assumedCapacityMbps = 1000;
      bandwidthPercent = Math.min(100, (bandwidthMbps / assumedCapacityMbps) * 100);
    }

    this._prevNetBytes = totalBytes;
    this._prevNetTime = now;

    return { bandwidthMbps, bandwidthPercent };
  }

  // ─── Browser monitoring via native Web APIs ───

  _startBrowser() {
    // Use PerformanceObserver for long-task detection (main thread blocking)
    try {
      this._perfObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'longtask' && entry.duration > 50) {
            this._longTaskCount++;
          }
        }
      });
      this._perfObserver.observe({ entryTypes: ['longtask'] });
    } catch {}

    const poll = async () => { try { await this._pollBrowser(); } catch {} };
    poll();
    this._timer = setInterval(poll, this.thresholds.pollIntervalMs);
  }

  async _pollBrowser() {
    const cpuCores = navigator.hardwareConcurrency || 0;
    const ramGB = (navigator).deviceMemory || 0;
    const conn = (navigator).connection || (navigator).mozConnection || (navigator).webkitConnection;
    const bandwidthMbps = conn?.downlink ? Math.round(conn.downlink) : 0;
    const saveData = conn?.saveData || false;
    const effectiveType = conn?.effectiveType || '4g';
    const rtt = conn?.rtt || 0;

    // Estimate CPU usage from long tasks in the last interval
    const longTaskRate = this._longTaskCount;
    this._longTaskCount = 0;
    const estimatedCpuPercent = Math.min(100, longTaskRate * 15);

    // Memory: use performance.memory if available (Chrome)
    let memPercent = 0;
    const perfMem = (performance).memory;
    if (perfMem) {
      memPercent = (perfMem.usedJSHeapSize / perfMem.jsHeapSizeLimit) * 100;
    }

    // Storage: use navigator.storage.estimate() (Storage API)
    let diskPercent = 0;
    let diskQuotaMB = 0;
    let diskUsedMB = 0;
    try {
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        diskQuotaMB = Math.floor((est.quota || 0) / (1024 * 1024));
        diskUsedMB = Math.floor((est.usage || 0) / (1024 * 1024));
        if (diskQuotaMB > 0) {
          diskPercent = (diskUsedMB / diskQuotaMB) * 100;
        }
      }
    } catch {}

    this._lastSnapshot = {
      platform: 'browser',
      cpuPercent: estimatedCpuPercent,
      memPercent,
      cpuCores,
      ramGB,
      bandwidthMbps,
      saveData,
      effectiveType,
      rtt,
      longTaskRate,
      diskPercent,
      diskQuotaMB,
      diskUsedMB,
      timestamp: Date.now(),
    };

    // Use browser-specific thresholds (stricter)
    const cpuPause = this.thresholds.browserCpuPausePercent;
    const cpuResume = this.thresholds.browserCpuResumePercent;
    const memPause = this.thresholds.browserMemPausePercent;
    const memResume = this.thresholds.browserMemResumePercent;
    const diskPause = this.thresholds.browserDiskPausePercent;
    const diskResume = this.thresholds.browserDiskResumePercent;
    const bwPause = this.thresholds.browserBandwidthPauseMbps;
    const bwResume = this.thresholds.browserBandwidthResumeMbps;

    this._checkThresholds(estimatedCpuPercent, memPercent, diskPercent, {
      cpuPause, cpuResume, memPause, memResume,
      diskPause, diskResume,
      bandwidthMbps, bwPauseMbps: bwPause, bwResumeMbps: bwResume,
      saveData, effectiveType,
    });
  }

  _checkThresholds(cpuPercent, memPercent, diskPercent, overrides = {}) {
    const cpuPause = overrides.cpuPause ?? this.thresholds.cpuPausePercent;
    const cpuResume = overrides.cpuResume ?? this.thresholds.cpuResumePercent;
    const memPause = overrides.memPause ?? this.thresholds.memPausePercent;
    const memResume = overrides.memResume ?? this.thresholds.memResumePercent;
    const diskPause = overrides.diskPause ?? this.thresholds.diskPausePercent;
    const diskResume = overrides.diskResume ?? this.thresholds.diskResumePercent;
    const bwPausePercent = overrides.bandwidthPausePercent ?? this.thresholds.bandwidthPausePercent;
    const bwResumePercent = overrides.bandwidthResumePercent ?? this.thresholds.bandwidthResumePercent;
    const bwPauseMbps = overrides.bwPauseMbps ?? null;
    const bwResumeMbps = overrides.bwResumeMbps ?? null;
    const saveData = overrides.saveData ?? false;
    const effectiveType = overrides.effectiveType ?? '4g';

    const wasPaused = this.paused;
    let reason = null;

    if (!this.paused) {
      if (cpuPercent >= cpuPause) {
        this.paused = true;
        reason = `CPU ${cpuPercent.toFixed(1)}% >= ${cpuPause}%`;
      } else if (memPercent >= memPause) {
        this.paused = true;
        reason = `Memory ${memPercent.toFixed(1)}% >= ${memPause}%`;
      } else if (diskPercent >= diskPause) {
        this.paused = true;
        reason = `Disk ${diskPercent.toFixed(1)}% >= ${diskPause}%`;
      } else if (bwPauseMbps !== null && overrides.bandwidthMbps < bwPauseMbps) {
        this.paused = true;
        reason = `Bandwidth ${overrides.bandwidthMbps}Mbps < ${bwPauseMbps}Mbps threshold`;
      } else if (overrides.bandwidthPercent !== undefined && overrides.bandwidthPercent >= bwPausePercent) {
        this.paused = true;
        reason = `Bandwidth utilization ${overrides.bandwidthPercent.toFixed(1)}% >= ${bwPausePercent}%`;
      } else if (saveData && (effectiveType === 'slow-2g' || effectiveType === '2g')) {
        this.paused = true;
        reason = `SaveData mode + ${effectiveType} connection`;
      }
    } else {
      const cpuOk = cpuPercent < cpuResume;
      const memOk = memPercent < memResume;
      const diskOk = diskPercent < diskResume;
      let bwOk = true;
      if (bwResumeMbps !== null && overrides.bandwidthMbps !== undefined) {
        bwOk = overrides.bandwidthMbps >= bwResumeMbps;
      }
      if (overrides.bandwidthPercent !== undefined) {
        bwOk = bwOk && overrides.bandwidthPercent < bwResumePercent;
      }
      const connOk = !saveData || (effectiveType !== 'slow-2g' && effectiveType !== '2g');

      if (cpuOk && memOk && diskOk && bwOk && connOk) {
        this.paused = false;
        reason = `Resources normalized (CPU ${cpuPercent.toFixed(1)}%, mem ${memPercent.toFixed(1)}%, disk ${diskPercent.toFixed(1)}%)`;
      }
    }

    if (this.paused !== wasPaused) {
      const event = {
        type: this.paused ? 'throttle' : 'resume',
        reason,
        snapshot: this._lastSnapshot,
      };
      this.listeners.forEach(fn => fn(event));
    }
  }
}
