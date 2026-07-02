// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserNode, type BrowserNodeStatus } from '../lib/browser-node';
import { Button, Card, Badge } from './ui';
import { Play, Square, Cpu, HardDrive, Wifi, Brain, CheckCircle, AlertTriangle, Loader2, Zap, Globe, Activity, ExternalLink } from 'lucide-react';

function StatusBadge({ running }: { running: boolean }) {
  if (running) return <Badge variant="success"><Activity className="h-3 w-3 mr-1" />Running</Badge>;
  return <Badge variant="default">Stopped</Badge>;
}

function RegBadge({ registered, registering }: { registered: boolean; registering: boolean }) {
  if (registering) return <Badge variant="warning"><Loader2 className="h-3 w-3 mr-1 animate-spin" />Registering</Badge>;
  if (registered) return <Badge variant="success"><CheckCircle className="h-3 w-3 mr-1" />Registered</Badge>;
  return <Badge variant="error"><AlertTriangle className="h-3 w-3 mr-1" />Not Registered</Badge>;
}

function CapRow({ icon, label, value, available }: { icon: React.ReactNode; label: string; value: string; available: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${available ? 'text-[#e8e2d8]' : 'text-[#7a7468]'}`}>
      <span className={available ? 'text-[#00e5ff]' : 'text-[#7a7468]'}>{icon}</span>
      <span className="font-medium">{label}:</span>
      <span>{value}</span>
    </div>
  );
}

function LogLine({ entry }: { entry: { timestamp: number; level: string; message: string } }) {
  const time = new Date(entry.timestamp).toLocaleTimeString();
  const colors: Record<string, string> = {
    info: 'text-[#7a7468]',
    warn: 'text-amber-400',
    error: 'text-red-400',
    success: 'text-emerald-400',
  };
  return (
    <div className={`text-[11px] font-mono ${colors[entry.level] || 'text-[#7a7468]'} leading-tight`}>
      <span className="text-[#7a7468]/50">{time}</span> {entry.message}
    </div>
  );
}

export default function BrowserNodeTab({ provider, publicKeyHex, accountHash }: {
  provider: any; publicKeyHex: string; accountHash: string; onTx: (tx: TxRecord) => void;
}) {
  const [status, setStatus] = useState<BrowserNodeStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const nodeRef = useRef<BrowserNode | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const canStart = !!provider && !!publicKeyHex && !!accountHash;

  useEffect(() => {
    if (nodeRef.current) {
      nodeRef.current.onStatusUpdate(setStatus);
    }
  }, []);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollTop = logEndRef.current.scrollHeight;
    }
  }, [status?.logs]);

  const handleStart = useCallback(async () => {
    if (!canStart) return;
    setStarting(true);
    try {
      const node = new BrowserNode(provider, publicKeyHex, accountHash);
      node.onStatusUpdate(setStatus);
      nodeRef.current = node;
      await node.start();
    } catch (e) {
      console.error('Failed to start browser node:', e);
    } finally {
      setStarting(false);
    }
  }, [provider, publicKeyHex, accountHash, canStart]);

  const handleStop = useCallback(async () => {
    setStopping(true);
    try {
      if (nodeRef.current) {
        await nodeRef.current.stop();
      }
    } catch (e) {
      console.error('Failed to stop browser node:', e);
    } finally {
      setStopping(false);
    }
  }, []);

  if (!canStart) {
    return (
      <Card className="p-8 text-center">
        <Globe className="h-12 w-12 mx-auto text-[#00e5ff]/40 mb-4" />
        <h3 className="text-lg font-bold text-[#e8e2d8] mb-2">Connect Wallet to Start</h3>
        <p className="text-sm text-[#7a7468] max-w-md mx-auto">
          Connect your Casper Wallet to run a browser node. No download required —
          your browser becomes a tasker network provider for compute, storage, bandwidth, and inference.
        </p>
      </Card>
    );
  }

  const caps = status?.capabilities;
  const isRunning = status?.running ?? false;

  return (
    <div className="space-y-6">
      {/* Hero / Start Panel */}
      <Card className="p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#00e5ff]/5 to-[#a855f7]/5 pointer-events-none" />
        <div className="relative">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-[#e8e2d8] flex items-center gap-2">
                <Zap className="h-5 w-5 text-[#00e5ff]" />
                Browser Node
              </h2>
              <p className="text-xs text-[#7a7468] mt-1">
                Run tasker network providers directly in your browser. No download needed.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge running={isRunning} />
              <RegBadge registered={status?.registered ?? false} registering={status?.registering ?? false} />
            </div>
          </div>

          {/* Start / Stop Controls */}
          <div className="flex items-center gap-3 mt-4">
            {!isRunning ? (
              <Button onClick={handleStart} disabled={starting} className="bg-gradient-to-br from-[#00e5ff] to-[#a855f7] text-black font-semibold">
                {starting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                {starting ? 'Starting...' : 'Start Browser Node'}
              </Button>
            ) : (
              <Button variant="danger" onClick={handleStop} disabled={stopping}>
                {stopping ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Square className="h-4 w-4 mr-2" />}
                {stopping ? 'Stopping...' : 'Stop Node'}
              </Button>
            )}
            <div className="text-xs text-[#7a7468]">
              {isRunning && status?.currentJob && (
                <span className="text-[#00e5ff]">Processing: {status.currentJob.slice(0, 20)}...</span>
              )}
              {isRunning && !status?.currentJob && (
                <span>Polling for jobs... (#{status?.pollCount ?? 0})</span>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-[#7a7468] uppercase tracking-wider">Jobs Processed</div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{status?.jobsProcessed ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-[#7a7468] uppercase tracking-wider">Jobs Failed</div>
          <div className="text-2xl font-bold text-red-400 mt-1">{status?.jobsFailed ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-[#7a7468] uppercase tracking-wider">Poll Cycles</div>
          <div className="text-2xl font-bold text-[#e8e2d8] mt-1">{status?.pollCount ?? 0}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-[#7a7468] uppercase tracking-wider">Provider Account</div>
          <div className="text-xs font-mono text-[#e8e2d8] mt-1 truncate">
            {accountHash.replace('account-hash-', '').slice(0, 14)}...{accountHash.slice(-6)}
          </div>
        </Card>
      </div>

      {/* Capabilities */}
      {caps && (
        <Card className="p-4">
          <h3 className="text-sm font-bold text-[#e8e2d8] mb-3">Browser Capabilities</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <CapRow icon={<Cpu className="h-3 w-3" />} label="CPU Cores" value={String(caps.cpuCores)} available={caps.cpuCores > 0} />
            <CapRow icon={<Brain className="h-3 w-3" />} label="RAM" value={`${caps.ramGb} GB`} available={caps.ramGb > 0} />
            <CapRow icon={<Brain className="h-3 w-3" />} label="WebGPU" value={caps.hasWebGPU ? caps.gpuName : 'Not available'} available={caps.hasWebGPU} />
            <CapRow icon={<HardDrive className="h-3 w-3" />} label="Storage" value={`${caps.storageQuotaMb} MB quota`} available={caps.storageQuotaMb > 0} />
            <CapRow icon={<Wifi className="h-3 w-3" />} label="Bandwidth" value={`${caps.bandwidthMbps} Mbps`} available={caps.bandwidthMbps > 0} />
            <CapRow icon={<Activity className="h-3 w-3" />} label="WebRTC" value={caps.hasWebRTC ? 'Available' : 'Not available'} available={caps.hasWebRTC} />
            <CapRow icon={<Cpu className="h-3 w-3" />} label="Web Workers" value={caps.hasWebWorker ? 'Available' : 'Not available'} available={caps.hasWebWorker} />
            <CapRow icon={<HardDrive className="h-3 w-3" />} label="IndexedDB" value={caps.hasIndexedDB ? 'Available' : 'Not available'} available={caps.hasIndexedDB} />
          </div>
        </Card>
      )}

      {/* Open Source Libraries */}
      <Card className="p-4">
        <h3 className="text-sm font-bold text-[#e8e2d8] mb-3 flex items-center gap-2">
          <ExternalLink className="h-3 w-3 text-[#00e5ff]" />
          Powered by Open Source
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2 text-[#7a7468]">
            <Brain className="h-3 w-3 text-[#00e5ff]" />
            <span>Inference: <a href="https://github.com/mlc-ai/web-llm" target="_blank" rel="noopener" className="text-[#00e5ff] hover:underline">@mlc-ai/web-llm</a> + <a href="https://github.com/huggingface/transformers.js" target="_blank" rel="noopener" className="text-[#00e5ff] hover:underline">transformers.js</a></span>
          </div>
          <div className="flex items-center gap-2 text-[#7a7468]">
            <HardDrive className="h-3 w-3 text-[#00e5ff]" />
            <span>Storage: <a href="https://github.com/ipfs/helia" target="_blank" rel="noopener" className="text-[#00e5ff] hover:underline">Helia (IPFS)</a></span>
          </div>
          <div className="flex items-center gap-2 text-[#7a7468]">
            <Cpu className="h-3 w-3 text-[#00e5ff]" />
            <span>Compute: <a href="https://github.com/wasmerio/wasmer-js" target="_blank" rel="noopener" className="text-[#00e5ff] hover:underline">@wasmer/sdk (WASI)</a></span>
          </div>
          <div className="flex items-center gap-2 text-[#7a7468]">
            <Wifi className="h-3 w-3 text-[#00e5ff]" />
            <span>Bandwidth: <a href="https://webrtc.org/" target="_blank" rel="noopener" className="text-[#00e5ff] hover:underline">WebRTC (native)</a></span>
          </div>
        </div>
      </Card>

      {/* Live Logs */}
      <Card className="p-4">
        <h3 className="text-sm font-bold text-[#e8e2d8] mb-3 flex items-center gap-2">
          <Activity className="h-3 w-3 text-[#00e5ff]" />
          Live Logs
        </h3>
        <div ref={logEndRef} className="h-48 overflow-y-auto space-y-0.5 bg-black/30 rounded-lg p-3 border border-white/5">
          {status?.logs && status.logs.length > 0 ? (
            status.logs.map((log, i) => <LogLine key={i} entry={log} />)
          ) : (
            <div className="text-xs text-[#7a7468]">No logs yet. Start the node to begin.</div>
          )}
        </div>
      </Card>
    </div>
  );
}
