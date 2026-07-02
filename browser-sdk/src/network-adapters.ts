// @ts-nocheck
/**
 * Network Adapters — Bridge browser capabilities to external tasker networks.
 *
 * Each adapter wraps a specific tasker network's protocol so the BrowserNode
 * can participate using browser-native tech (WASM, WebRTC, IPFS, WebLLM).
 *
 * Supported: Golem (compute), Mysterium (VPN), Anyone (relay), BTFS (storage), BTT AI (inference)
 */

export interface NetworkAdapterStatus {
  network: string;
  running: boolean;
  jobsServed: number;
  jobsFailed: number;
  earnings: string;
  details: Record<string, any>;
}

export interface NetworkAdapter {
  readonly networkName: string;
  init(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  status(): NetworkAdapterStatus;
}

type LogFn = (level: string, msg: string) => void;

// ─── Golem (compute via WASM) ──────────────────────────────────────

export class GolemNetworkAdapter implements NetworkAdapter {
  readonly networkName = 'golem';
  private running = false;
  private jobsServed = 0;
  private jobsFailed = 0;
  private earnings = '0';
  private wasmerReady = false;
  private log: LogFn;

  constructor(logFn: LogFn) { this.log = logFn; }

  async init(): Promise<void> {
    try {
      await import(/* @vite-ignore */ '@wasmer/sdk');
      this.wasmerReady = true;
      this.log('info', '[Golem] Wasmer SDK loaded');
    } catch {
      this.log('warn', '[Golem] @wasmer/sdk not available — using Web Worker fallback');
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.log('info', '[Golem] Browser compute provider started');
  }

  async stop(): Promise<void> {
    this.running = false;
    this.log('info', '[Golem] Stopped');
  }

  status(): NetworkAdapterStatus {
    return {
      network: this.networkName, running: this.running,
      jobsServed: this.jobsServed, jobsFailed: this.jobsFailed, earnings: this.earnings,
      details: { runtime: this.wasmerReady ? 'wasmer-wasi' : 'web-worker' },
    };
  }

  async executeCompute(code: string, runtime: string, args: string[] = []): Promise<string> {
    if (this.wasmerReady) {
      try {
        const { Wasmer } = await import(/* @vite-ignore */ '@wasmer/sdk');
        let pkgName = 'saghul/quickjs';
        let runArgs: string[] = ['-e', code.slice(0, 1000)];
        if (runtime === 'python') { pkgName = 'python/python'; runArgs = ['-c', code.slice(0, 1000)]; }
        else if (runtime === 'shell' || runtime === 'sh') { pkgName = 'sharrattj/shell'; runArgs = ['-c', code.slice(0, 1000)]; }
        else if (args.length > 0) { runArgs = args.slice(0, 20); }
        const pkg = await Wasmer.fromRegistry(pkgName);
        const instance = await pkg.entrypoint.run({ args: runArgs });
        const { stdout } = await instance.wait();
        this.jobsServed++;
        return stdout || '';
      } catch (e: any) { this.jobsFailed++; throw e; }
    }
    if (runtime === 'javascript' || runtime === 'js') {
      const result = await this._runJsInWorker(code.slice(0, 5000));
      this.jobsServed++;
      return result;
    }
    this.jobsFailed++;
    throw new Error(`Cannot execute ${runtime} without Wasmer`);
  }

  private _runJsInWorker(code: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const blob = new Blob([
        `try{const r=eval(${JSON.stringify(code)});self.postMessage({result:String(r||'')});}catch(e){self.postMessage({error:e.message});}`,
      ], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      const timeout = setTimeout(() => { worker.terminate(); URL.revokeObjectURL(url); reject(new Error('timeout')); }, 10000);
      worker.onmessage = (e) => {
        clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(url);
        if (e.data.error) reject(new Error(e.data.error)); else resolve(e.data.result || '');
      };
      worker.onerror = (e) => { clearTimeout(timeout); worker.terminate(); URL.revokeObjectURL(url); reject(new Error(e.message || 'error')); };
    });
  }
}

// ─── Mysterium (VPN relay via WebRTC) ──────────────────────────────

export class MysteriumNetworkAdapter implements NetworkAdapter {
  readonly networkName = 'mysterium';
  private running = false;
  private jobsServed = 0;
  private jobsFailed = 0;
  private earnings = '0';
  private activeConnections: RTCPeerConnection[] = [];
  private log: LogFn;

  constructor(logFn: LogFn) { this.log = logFn; }

  async init(): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') throw new Error('WebRTC not available');
    this.log('info', '[Mysterium] WebRTC VPN relay adapter ready');
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.log('info', '[Mysterium] Browser VPN relay node started');
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const pc of this.activeConnections) { try { pc.close(); } catch {} }
    this.activeConnections = [];
    this.log('info', '[Mysterium] Stopped');
  }

  status(): NetworkAdapterStatus {
    return {
      network: this.networkName, running: this.running,
      jobsServed: this.jobsServed, jobsFailed: this.jobsFailed, earnings: this.earnings,
      details: { activeConnections: this.activeConnections.length, serviceType: 'webRTC-VPN-relay' },
    };
  }

  async serveVPNSession(offerSdp: string, duration: string): Promise<{ answerSdp: string; sessionId: string }> {
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      pc.createDataChannel('mysterium-vpn', { ordered: false, maxRetransmits: 0 });
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 5000);
        pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(null); } };
      });
      this.activeConnections.push(pc);
      this.jobsServed++;
      const sessionId = `${Date.now()}-${this.jobsServed}`;
      this.log('info', `[Mysterium] VPN session ${sessionId} (${duration})`);
      return { answerSdp: pc.localDescription?.sdp || '', sessionId };
    } catch (e: any) { this.jobsFailed++; throw e; }
  }
}

// ─── Anyone Protocol (onion relay via WebRTC) ──────────────────────

export class AnyoneNetworkAdapter implements NetworkAdapter {
  readonly networkName = 'anyone-protocol';
  private running = false;
  private jobsServed = 0;
  private jobsFailed = 0;
  private earnings = '0';
  private relayConnections: RTCPeerConnection[] = [];
  private log: LogFn;

  constructor(logFn: LogFn) { this.log = logFn; }

  async init(): Promise<void> {
    if (typeof RTCPeerConnection === 'undefined') throw new Error('WebRTC not available');
    this.log('info', '[Anyone] WebRTC onion relay adapter ready');
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.log('info', '[Anyone] Browser relay node started');
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const pc of this.relayConnections) { try { pc.close(); } catch {} }
    this.relayConnections = [];
    this.log('info', '[Anyone] Stopped');
  }

  status(): NetworkAdapterStatus {
    return {
      network: this.networkName, running: this.running,
      jobsServed: this.jobsServed, jobsFailed: this.jobsFailed, earnings: this.earnings,
      details: { activeRelays: this.relayConnections.length, relayType: 'webRTC-onion-hop', rewardToken: 'ANYONE' },
    };
  }

  async serveRelayHop(offerSdp: string, nextHop: string): Promise<{ answerSdp: string; relayId: string }> {
    try {
      const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
      const dc = pc.createDataChannel('anyone-relay', { ordered: false, maxRetransmits: 0 });
      dc.binaryType = 'arraybuffer';
      dc.onmessage = () => { if (dc.readyState === 'open') { try { dc.send(new ArrayBuffer(0)); } catch {} } };
      await pc.setRemoteDescription({ type: 'offer', sdp: offerSdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await new Promise((resolve) => {
        const t = setTimeout(resolve, 5000);
        pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(null); } };
      });
      this.relayConnections.push(pc);
      this.jobsServed++;
      const relayId = `relay-${Date.now()}-${this.jobsServed}`;
      this.log('info', `[Anyone] Relay ${relayId} → ${nextHop.slice(0, 16)}...`);
      dc.onclose = () => {
        const idx = this.relayConnections.indexOf(pc);
        if (idx >= 0) this.relayConnections.splice(idx, 1);
        try { pc.close(); } catch {}
      };
      return { answerSdp: pc.localDescription?.sdp || '', relayId };
    } catch (e: any) { this.jobsFailed++; throw e; }
  }
}

// ─── BTFS (storage via IPFS/Helia) ────────────────────────────────

export class BtfsNetworkAdapter implements NetworkAdapter {
  readonly networkName = 'btfs';
  private running = false;
  private jobsServed = 0;
  private jobsFailed = 0;
  private earnings = '0';
  private heliaNode: any = null;
  private heliaFs: any = null;
  private log: LogFn;

  constructor(logFn: LogFn) { this.log = logFn; }

  async init(): Promise<void> {
    try {
      const { createHelia } = await import(/* @vite-ignore */ '@helia/ipfs');
      const { unixfs } = await import(/* @vite-ignore */ '@helia/unixfs');
      this.heliaNode = await createHelia();
      this.heliaFs = unixfs(this.heliaNode);
      this.log('info', '[BTFS] Helia IPFS node initialized');
    } catch {
      this.log('warn', '[BTFS] @helia/ipfs not available — using IndexedDB fallback');
    }
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.log('info', '[BTFS] Browser storage provider started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.heliaNode) { try { await this.heliaNode.stop(); } catch {} this.heliaNode = null; this.heliaFs = null; }
    this.log('info', '[BTFS] Stopped');
  }

  status(): NetworkAdapterStatus {
    return {
      network: this.networkName, running: this.running,
      jobsServed: this.jobsServed, jobsFailed: this.jobsFailed, earnings: this.earnings,
      details: { storageEngine: this.heliaNode ? 'helia-ipfs' : 'indexeddb-fallback' },
    };
  }

  async storeData(data: Uint8Array): Promise<string> {
    try {
      if (this.heliaFs) {
        const cid = await this.heliaFs.addBytes(data);
        this.jobsServed++;
        return cid.toString();
      }
      const db = await this._getIDB();
      const key = `btfs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('files', 'readwrite');
        tx.objectStore('files').put({ key, data });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      this.jobsServed++;
      return key;
    } catch (e: any) { this.jobsFailed++; throw e; }
  }

  async retrieveData(cid: string): Promise<Uint8Array | null> {
    try {
      if (this.heliaFs) {
        const { CID } = await import(/* @vite-ignore */ 'multiformats/cid');
        const chunks: Uint8Array[] = [];
        for await (const chunk of this.heliaFs.cat(CID.parse(cid))) chunks.push(chunk);
        this.jobsServed++;
        const combined = new Uint8Array(chunks.reduce((a, c) => a + c.length, 0));
        let off = 0; for (const c of chunks) { combined.set(c, off); off += c.length; }
        return combined;
      }
      const db = await this._getIDB();
      const result = await new Promise<any>((resolve, reject) => {
        const req = db.transaction('files', 'readonly').objectStore('files').get(cid);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      this.jobsServed++;
      return result?.data || null;
    } catch (e: any) { this.jobsFailed++; throw e; }
  }

  private async _getIDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('chimera-btfs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
}

// ─── BTT AI (inference via WebLLM/transformers.js) ─────────────────

export class BttAiNetworkAdapter implements NetworkAdapter {
  readonly networkName = 'btt-ai';
  private running = false;
  private jobsServed = 0;
  private jobsFailed = 0;
  private earnings = '0';
  private webllmEngine: any = null;
  private webllmLoading = false;
  private inferencePipeline: any = null;
  private hasWebGPU = false;
  private log: LogFn;

  constructor(logFn: LogFn, caps?: { hasWebGPU?: boolean }) {
    this.log = logFn;
    this.hasWebGPU = caps?.hasWebGPU || false;
  }

  async init(): Promise<void> {
    this.hasWebGPU = !!(navigator as any).gpu;
    this.log('info', `[BTT-AI] ${this.hasWebGPU ? 'WebGPU detected — will use WebLLM' : 'No WebGPU — will use transformers.js'}`);
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.log('info', '[BTT-AI] Browser inference provider started');
    if (this.hasWebGPU) this._ensureWebLLM().catch(() => {});
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.webllmEngine) { try { await this.webllmEngine.unload(); } catch {} this.webllmEngine = null; }
    this.inferencePipeline = null;
    this.log('info', '[BTT-AI] Stopped');
  }

  status(): NetworkAdapterStatus {
    return {
      network: this.networkName, running: this.running,
      jobsServed: this.jobsServed, jobsFailed: this.jobsFailed, earnings: this.earnings,
      details: { engine: this.webllmEngine ? 'webllm' : this.inferencePipeline ? 'transformers.js' : 'none', hasWebGPU: this.hasWebGPU },
    };
  }

  async infer(messages: any[], maxTokens = 256, temperature = 0.7): Promise<string> {
    try {
      if (this.hasWebGPU) {
        const engine = await this._ensureWebLLM();
        if (engine) {
          const c = await engine.chat.completions.create({ messages, max_tokens: maxTokens, temperature, stream: false });
          this.jobsServed++;
          return c.choices?.[0]?.message?.content || '';
        }
      }
      const pipe = await this._ensurePipeline();
      if (pipe) {
        const prompt = messages.map(m => `${m.role}: ${m.content}`).join('\n');
        const out = await pipe(prompt.slice(0, 500), { max_new_tokens: maxTokens, temperature });
        const text = Array.isArray(out) ? out[0]?.generated_text || '' : out.generated_text || '';
        this.jobsServed++;
        return text;
      }
      this.jobsFailed++;
      return '';
    } catch (e: any) { this.jobsFailed++; throw e; }
  }

  private async _ensureWebLLM(): Promise<any> {
    if (this.webllmEngine) return this.webllmEngine;
    if (this.webllmLoading) return null;
    this.webllmLoading = true;
    try {
      const { CreateMLCEngine } = await import(/* @vite-ignore */ '@mlc-ai/web-llm');
      this.webllmEngine = await CreateMLCEngine('Llama-3.2-1B-Instruct-q4f16_1-MLC', {
        initProgress: (p: any) => this.log('debug', `[BTT-AI] WebLLM: ${Math.round(p.progress * 100)}%`),
      });
      this.log('success', '[BTT-AI] WebLLM loaded');
      return this.webllmEngine;
    } catch (e: any) { this.log('warn', `[BTT-AI] WebLLM failed: ${e.message}`); return null; }
    finally { this.webllmLoading = false; }
  }

  private async _ensurePipeline(): Promise<any> {
    if (this.inferencePipeline) return this.inferencePipeline;
    try {
      const { pipeline } = await import(/* @vite-ignore */ '@huggingface/transformers');
      this.inferencePipeline = await pipeline('text-generation', 'onnx-community/Llama-3.2-1B-Instruct-q4f16', {
        device: 'wasm', dtype: 'q4f16',
      });
      this.log('success', '[BTT-AI] transformers.js pipeline loaded');
      return this.inferencePipeline;
    } catch (e: any) { this.log('warn', `[BTT-AI] transformers.js failed: ${e.message}`); return null; }
  }
}

// ─── Factory: create all adapters ──────────────────────────────────

export function createAllAdapters(logFn: LogFn, caps?: { hasWebGPU?: boolean }): NetworkAdapter[] {
  return [
    new GolemNetworkAdapter(logFn),
    new MysteriumNetworkAdapter(logFn),
    new AnyoneNetworkAdapter(logFn),
    new BtfsNetworkAdapter(logFn),
    new BttAiNetworkAdapter(logFn, caps),
  ];
}
