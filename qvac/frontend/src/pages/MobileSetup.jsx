import { useState, useEffect } from 'react';
import { Smartphone, Shield, Cpu, Download, Apple } from 'lucide-react';

export function MobileSetup() {
  const [platform, setPlatform] = useState('');

  useEffect(() => {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) setPlatform('android');
    else if (/iPhone|iPad|iPod/i.test(ua)) setPlatform('ios');
    else setPlatform('other');
  }, []);

  if (platform === 'ios') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-cyan-400/10 flex items-center justify-center mx-auto mb-4">
            <Apple size={24} className="text-cyan-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Chimera for iOS</h2>
          <p className="text-white/40 text-sm max-w-lg mx-auto leading-relaxed">
            A standalone app that runs @qvac/sdk natively on your iPhone.
            Each device is its own node — no relay, no desktop dependency.
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/5 p-6 text-center">
            <h3 className="text-white font-semibold text-lg mb-2">App Store</h3>
            <p className="text-white/40 text-sm mb-4">
              Coming soon to the App Store. Each iPhone runs its own QVAC inference node.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white/60 text-sm">
              <Download size={16} />
              <span>Submit for Review</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/8 bg-black/30 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-green-400" />
              <span className="text-green-300 text-sm font-medium">Hardened sandbox</span>
            </div>
            <p className="text-white/30 text-xs leading-relaxed">
              The iOS app runs inside Apple's hardened sandbox: code-signed, process-isolated,
              with no escape to the host system. @qvac/sdk performs inference via the Apple Neural Engine.
            </p>
          </div>

          <div className="rounded-xl border border-white/8 bg-black/30 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={14} className="text-cyan-400" />
              <span className="text-cyan-300 text-sm font-medium">What runs on your phone</span>
            </div>
            <ul className="text-white/30 text-xs space-y-2 list-disc pl-4">
              <li>Full QVAC inference node with @qvac/sdk</li>
              <li>QVAK with Metal GPU acceleration</li>
              <li>P2P networking via Bare runtime (Holepunch)</li>
              <li>LLM Wiki interface</li>
              <li>Mining capabilities for task networks</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  if (platform === 'android') {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-xl bg-green-400/10 flex items-center justify-center mx-auto mb-4">
            <Smartphone size={24} className="text-green-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-3">Chimera for Android</h2>
          <p className="text-white/40 text-sm max-w-lg mx-auto leading-relaxed">
            A standalone app that runs @qvac/sdk natively on your Android device.
            Each phone is its own node — no relay, no desktop dependency.
          </p>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-green-400/15 bg-green-400/5 p-6 text-center">
            <h3 className="text-white font-semibold text-lg mb-2">Google Play Store</h3>
            <p className="text-white/40 text-sm mb-4">
              Coming soon to the Play Store. Each Android device runs its own QVAC inference node.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 text-white/60 text-sm">
              <Download size={16} />
              <span>Submit for Review</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/8 bg-black/30 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Shield size={14} className="text-green-400" />
              <span className="text-green-300 text-sm font-medium">Hardened sandbox</span>
            </div>
            <p className="text-white/30 text-xs leading-relaxed">
              The Android app runs inside the OS sandbox: SELinux-enforced, process-isolated,
              with no root access. @qvac/sdk performs inference via Vulkan GPU acceleration.
            </p>
          </div>

          <div className="rounded-xl border border-white/8 bg-black/30 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Cpu size={14} className="text-cyan-400" />
              <span className="text-cyan-300 text-sm font-medium">What runs on your phone</span>
            </div>
            <ul className="text-white/30 text-xs space-y-2 list-disc pl-4">
              <li>Full QVAC inference node with @qvac/sdk</li>
              <li>QVAK with Vulkan GPU acceleration</li>
              <li>P2P networking via Bare runtime (Holepunch)</li>
              <li>LLM Wiki interface</li>
              <li>Mining capabilities for task networks</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-6 py-16 text-center">
      <h2 className="text-2xl font-bold text-white mb-4">Open this page on your phone</h2>
      <p className="text-white/40 text-sm">
        Platform-specific instructions appear automatically for iOS and Android.
      </p>
    </div>
  );
}
