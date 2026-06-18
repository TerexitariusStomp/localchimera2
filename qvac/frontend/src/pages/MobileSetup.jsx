import { useState, useEffect } from 'react';
import { Terminal, Shield, Cpu, Wifi, Copy, Check, Zap, ArrowRight } from 'lucide-react';

const ANDROID_SCRIPT = `pkg update -y
pkg install nodejs git -y
termux-setup-storage
cd ~
if [ ! -d "qvac-chimera" ]; then
  git clone https://github.com/TerexitariusStomp/qvac-chimera.git
fi
cd qvac-chimera/qvac
npm install
cd frontend && npm install && npm run build && cd ..
export MACHINE_OWNER_EVM=0xYOUR_ADDRESS
export APP_ID=protocol-default
node src/index.js`;

export function MobileSetup() {
  const [platform, setPlatform] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) setPlatform('android');
    else if (/iPhone|iPad|iPod/i.test(ua)) setPlatform('ios');
    else setPlatform('other');
  }, []);

  const copy = () => {
    navigator.clipboard.writeText(ANDROID_SCRIPT);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (platform === 'ios') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-cyan-400/10 flex items-center justify-center mx-auto mb-4">
            <Cpu size={24} className="text-cyan-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">iOS — Relayed P2P with Local Inference</h2>
          <p className="text-white/40 text-sm max-w-lg mx-auto leading-relaxed">
            Your iPhone runs inference locally via Core ML, while a relay server handles all P2P networking on your behalf.
            The relay is the "face" of your device on the network — your phone is the "brain."
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-white/8 bg-black/30 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap size={14} className="text-cyan-400" />
              <span className="text-cyan-300 text-sm font-medium">How it works</span>
            </div>
            <ol className="text-white/30 text-xs space-y-2 list-decimal pl-4">
              <li>A relay server runs on your desktop, home server, or cloud VM</li>
              <li>The relay joins the P2P network (Hyperswarm, DHT) as your proxy</li>
              <li>When a task arrives, the relay forwards it to your iPhone via WebSocket</li>
              <li>Your iPhone runs Core ML inference locally (Apple Neural Engine)</li>
              <li>Result goes back through the relay to the requester on the P2P network</li>
            </ol>
          </div>

          <div className="rounded-xl border border-green-400/10 bg-green-400/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Shield size={14} className="text-green-400" />
              <span className="text-green-300 text-sm font-medium">Why this architecture</span>
            </div>
            <p className="text-white/30 text-xs leading-relaxed">
              iOS blocks raw UDP sockets, DHT bootstrap, and background execution. The relay handles all networking
              while your phone does what it does best: fast, efficient inference on the Neural Engine.
            </p>
          </div>

          <div className="rounded-xl border border-purple-400/10 bg-purple-400/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Wifi size={14} className="text-purple-400" />
              <span className="text-purple-300 text-sm font-medium">Setup</span>
            </div>
            <ol className="text-white/30 text-xs space-y-2 list-decimal pl-4">
              <li>Install the desktop app (or run the Docker image) on a always-on machine</li>
              <li>The relay server starts automatically on port 8765</li>
              <li>Install the iOS app, enter the relay URL (e.g., <code className="text-cyan-400">ws://192.168.1.50:8765</code>)</li>
              <li>Add a Core ML model to the iOS app bundle</li>
              <li>Your iPhone now earns by serving inference to the P2P network</li>
            </ol>
          </div>

          <div className="rounded-xl border border-amber-400/10 bg-amber-400/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-amber-400" />
              <span className="text-amber-300 text-sm font-medium">Adding a Core ML model</span>
            </div>
            <pre className="text-[10px] text-green-400 font-mono bg-black/40 p-2 rounded overflow-x-auto mt-2">
{`pip install coremltools
# Convert ONNX / PyTorch -> Core ML
ct.converters.convert(model, source="pytorch", outputs=["my_model.mlpackage"])
# Add .mlpackage to Xcode project under ios/App/App/Models/
# Call OnnxInference.loadModel({ modelPath: "my_model" })`}
            </pre>
          </div>
        </div>
      </div>
    );
  }

  if (platform === 'other') {
    return (
      <div className="max-w-xl mx-auto px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">Open this page on your phone</h2>
        <p className="text-white/40 text-sm">
          Platform-specific setup instructions appear automatically for Android and iOS.
        </p>
      </div>
    );
  }

  // Android
  return (
    <div className="max-w-2xl mx-auto px-6 py-12">
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-xl bg-green-400/10 flex items-center justify-center mx-auto mb-4">
          <Shield size={24} className="text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-3">Android — Full QVAC in Hardened Container</h2>
        <p className="text-white/40 text-sm max-w-lg mx-auto leading-relaxed">
          Termux provides a real Linux container (PID namespace, filesystem isolation, no root).
          Inside it, you run the full Node.js stack with native modules, P2P networking, and local inference.
        </p>
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-white/8 bg-black/30 p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-6 h-6 rounded-full bg-green-400/20 text-green-400 text-xs font-bold flex items-center justify-center">1</span>
            <span className="text-white font-medium text-sm">Install Termux</span>
          </div>
          <p className="text-white/30 text-xs pl-9">
            Download from <a href="https://f-droid.org/en/packages/com.termux/" target="_blank" rel="noopener noreferrer" className="text-green-400 underline">F-Droid</a>.
            The Play Store version is outdated. Termux is a hardened Linux container with its own userspace.
          </p>
        </div>

        <div className="rounded-xl border border-white/8 bg-black/30 p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-6 h-6 rounded-full bg-green-400/20 text-green-400 text-xs font-bold flex items-center justify-center">2</span>
            <span className="text-white font-medium text-sm">Copy the setup script</span>
          </div>
          <div className="relative mt-2">
            <pre className="text-[11px] text-green-400 font-mono whitespace-pre-wrap bg-black/50 p-3 rounded overflow-x-auto leading-relaxed">
{ANDROID_SCRIPT}
            </pre>
            <button
              onClick={copy}
              className="absolute top-2 right-2 px-2 py-1 rounded bg-white/10 text-white/60 text-xs hover:bg-white/15 transition-colors flex items-center gap-1"
            >
              {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-white/8 bg-black/30 p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-6 h-6 rounded-full bg-green-400/20 text-green-400 text-xs font-bold flex items-center justify-center">3</span>
            <span className="text-white font-medium text-sm">Paste & run in Termux</span>
          </div>
          <p className="text-white/30 text-xs pl-9">
            Long-press in Termux to paste, then press Enter. First run takes 5-10 minutes to compile native modules.
          </p>
        </div>

        <div className="rounded-xl border border-white/8 bg-black/30 p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-6 h-6 rounded-full bg-green-400/20 text-green-400 text-xs font-bold flex items-center justify-center">4</span>
            <span className="text-white font-medium text-sm">Open the app</span>
          </div>
          <p className="text-white/30 text-xs pl-9">
            Open <strong className="text-white/60">http://localhost:3002</strong> in your browser.
            The node runs inside Termux's hardened container, isolated from Android.
          </p>
        </div>
      </div>
    </div>
  );
}
