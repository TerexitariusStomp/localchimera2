import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";

interface Status {
  running: boolean;
  nodeId: string;
  inference?: { isRunning?: boolean };
  mining?: { running: boolean; currentMiner: string | null; availableMiners: string[] };
  embedding?: { ready?: boolean };
  p2p?: { running?: boolean; peers?: number };
}

export function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState({ start: false, stop: false });
  const [backendUrl] = useState("http://localhost:3002");

  // Wallet / mining consent
  const [evmAddress, setEvmAddress] = useState("");
  const [walletError, setWalletError] = useState("");

  // Settings state
  const [autoStart, setAutoStart] = useState(false);
  const [desktopIcon, setDesktopIcon] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState({ auto: false, desk: false });

  // Docker status
  const [dockerPresent, setDockerPresent] = useState<boolean | null>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/status`);
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    invoke<boolean>("docker_status").then(setDockerPresent).catch(() => setDockerPresent(false));
  }, []);

  // Load current settings on mount
  useEffect(() => {
    invoke<boolean>("get_autostart").then(setAutoStart).catch(() => {});
    invoke<boolean>("has_desktop_shortcut").then(setDesktopIcon).catch(() => {});
  }, []);

  const toggleAutoStart = async () => {
    setSettingsLoading(l => ({ ...l, auto: true }));
    const next = !autoStart;
    try {
      await invoke("set_autostart", { enabled: next });
      setAutoStart(next);
    } catch (e) { console.error(e); }
    setSettingsLoading(l => ({ ...l, auto: false }));
  };

  const toggleDesktopIcon = async () => {
    setSettingsLoading(l => ({ ...l, desk: true }));
    const next = !desktopIcon;
    try {
      if (next) await invoke("create_desktop_shortcut");
      else await invoke("remove_desktop_shortcut");
      setDesktopIcon(next);
    } catch (e) { console.error(e); }
    setSettingsLoading(l => ({ ...l, desk: false }));
  };

  const isValidEvm = (addr: string) => /^0x[a-fA-F0-9]{40}$/.test(addr.trim());

  const startMining = async () => {
    setWalletError("");
    const addr = evmAddress.trim();
    if (!isValidEvm(addr)) {
      setWalletError("Enter a valid 42-character EVM address (0x...).");
      return;
    }
    setLoading(l => ({ ...l, start: true }));
    try {
      const res = await fetch(`${backendUrl}/api/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evmAddress: addr }),
      });
      if (!res.ok) {
        const text = await res.text();
        setWalletError(text || "Failed to start mining.");
      } else {
        await fetchStatus();
      }
    } catch {
      setWalletError("Network error — is the backend running?");
    }
    setLoading(l => ({ ...l, start: false }));
  };

  const stopMining = async () => {
    setLoading(l => ({ ...l, stop: true }));
    try {
      await fetch(`${backendUrl}/api/stop`, { method: "POST" });
      await fetchStatus();
    } catch {}
    setLoading(l => ({ ...l, stop: false }));
  };

  const miners = status?.mining?.availableMiners || [];
  const miningRunning = status?.mining?.running || false;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 800, margin: "0 auto" }}>
      {/* Docker required banner */}
      {dockerPresent === false && (
        <div style={{
          padding: "12px 16px",
          borderRadius: 8,
          background: "#450a0a",
          border: "1px solid #b91c1c",
          color: "#fca5a5",
          fontSize: 13,
          fontWeight: 600,
        }}>
          🐳 Docker is required. Chimera runs inside a hardened container.
          <a href="https://docs.docker.com/get-docker/" target="_blank" rel="noopener" style={{ color: "#00e5ff", marginLeft: 8 }}>Install Docker →</a>
        </div>
      )}

      {/* Status bar */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 20px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "#0b0a09",
      }}>
        <div>
          <div style={{ fontSize: 12, color: "#4a4540", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 4 }}>
            Node Status
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: status?.running ? "#86efac" : "#fca5a5" }}>
            {status?.running ? "🟢 Running" : "⚪ Stopped"}
          </div>
          <div style={{ fontSize: 12, color: "#7a7468", marginTop: 4 }}>
            {status?.nodeId ? `ID: ${status.nodeId.slice(0, 12)}...` : "Connecting to backend..."}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={() => open(backendUrl)}
            style={{
              padding: "8px 18px",
              borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "#161410",
              color: "#b0a898",
              fontWeight: 600,
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Open App →
          </button>
        </div>
      </div>

      {/* Services grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 10,
      }}>
        {[
          { label: "Inference", active: status?.inference?.isRunning, color: "#00e5ff" },
          { label: "Embedding", active: status?.embedding?.ready, color: "#a855f7" },
          { label: "Mining", active: miningRunning, color: "#22c55e" },
          { label: "P2P", active: status?.p2p?.running, color: "#f97316" },
        ].map(s => (
          <div key={s.label} style={{
            padding: "12px 14px",
            borderRadius: 8,
            border: "1px solid rgba(255,255,255,0.06)",
            background: "#0b0a09",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: s.active ? s.color : "#450a0a",
              boxShadow: s.active ? `0 0 6px ${s.color}` : "none",
            }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: s.active ? "#e8e2d8" : "#7a7468" }}>
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Mining panel */}
      <div style={{
        padding: "16px 20px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "#0b0a09",
      }}>
        <div style={{ fontSize: 12, color: "#4a4540", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 12 }}>
          Mining Networks
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
          {miners.length === 0 ? (
            <span style={{ fontSize: 13, color: "#7a7468" }}>No miners configured</span>
          ) : (
            miners.map(m => (
              <span key={m} style={{
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 12,
                fontWeight: 600,
                background: miningRunning ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.03)",
                color: miningRunning ? "#22c55e" : "#7a7468",
                border: `1px solid ${miningRunning ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}`,
                textTransform: "capitalize",
              }}>
                {m}
              </span>
            ))
          )}
        </div>

        {!miningRunning && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
            <div style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(0,229,255,0.05)",
              border: "1px solid rgba(0,229,255,0.15)",
              color: "#7dd3fc",
              fontSize: 12,
              fontWeight: 500,
            }}>
              Enter your EVM wallet address and click Start. Your node will automatically register as a provider on all Casper markets (inference, storage, compute, bandwidth).
            </div>
            <input
              type="text"
              placeholder="Your EVM wallet address (0x...)"
              value={evmAddress}
              onChange={e => { setEvmAddress(e.target.value); setWalletError(""); }}
              disabled={loading.start}
              style={{
                width: "100%",
                padding: "10px 14px",
                borderRadius: 8,
                border: `1px solid ${walletError ? "#b91c1c" : "rgba(255,255,255,0.1)"}`,
                background: "#0a0a12",
                color: "#e8e2d8",
                fontSize: 13,
                fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Code', 'Fira Code', monospace",
                outline: "none",
              }}
            />
            {walletError && (
              <div style={{ fontSize: 12, color: "#fca5a5" }}>{walletError}</div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          {!miningRunning ? (
            <button
              onClick={startMining}
              disabled={loading.start || !status?.running}
              style={{
                padding: "8px 18px",
                borderRadius: 6,
                border: "none",
                background: !status?.running ? "#161410" : "#c9a96e",
                color: !status?.running ? "#7a7468" : "#0e0d0b",
                fontWeight: 600,
                fontSize: 13,
                cursor: (loading.start || !status?.running) ? "not-allowed" : "pointer",
                opacity: (loading.start || !status?.running) ? 0.5 : 1,
              }}
            >
              {loading.start ? "Starting..." : "▶ Start Mining"}
            </button>
          ) : (
            <button
              onClick={stopMining}
              disabled={loading.stop}
              style={{
                padding: "8px 18px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: "#fca5a5",
                fontWeight: 600,
                fontSize: 13,
                cursor: loading.stop ? "not-allowed" : "pointer",
                opacity: loading.stop ? 0.6 : 1,
              }}
            >
              {loading.stop ? "Stopping..." : "⏹ Stop Mining"}
            </button>
          )}
        </div>
      </div>

      {/* Settings */}
      <div style={{
        padding: "16px 20px",
        borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.06)",
        background: "#0b0a09",
      }}>
        <div style={{ fontSize: 12, color: "#4a4540", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 12 }}>
          Settings
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Auto-start */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, color: "#b0a898" }}>Start on system boot</div>
              <div style={{ fontSize: 11, color: "#4a4540" }}>Auto-launch Chimera when you log in</div>
            </div>
            <button
              onClick={toggleAutoStart}
              disabled={settingsLoading.auto}
              style={{
                width: 44, height: 24, borderRadius: 12,
                background: autoStart ? "#00e5ff" : "#161410",
                border: "1px solid rgba(255,255,255,0.1)",
                position: "relative", cursor: "pointer", transition: "0.2s",
                opacity: settingsLoading.auto ? 0.6 : 1,
              }}
            >
              <span style={{
                position: "absolute", top: 2, left: autoStart ? 22 : 2,
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                transition: "0.2s", display: "block"
              }} />
            </button>
          </div>

          {/* Desktop icon */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 13, color: "#b0a898" }}>Desktop icon</div>
              <div style={{ fontSize: 11, color: "#4a4540" }}>Create a shortcut on your desktop</div>
            </div>
            <button
              onClick={toggleDesktopIcon}
              disabled={settingsLoading.desk}
              style={{
                width: 44, height: 24, borderRadius: 12,
                background: desktopIcon ? "#00e5ff" : "#161410",
                border: "1px solid rgba(255,255,255,0.1)",
                position: "relative", cursor: "pointer", transition: "0.2s",
                opacity: settingsLoading.desk ? 0.6 : 1,
              }}
            >
              <span style={{
                position: "absolute", top: 2, left: desktopIcon ? 22 : 2,
                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                transition: "0.2s", display: "block"
              }} />
            </button>
          </div>

          {/* Taskbar pin note */}
          <div style={{ fontSize: 11, color: "#4a4540", marginTop: 4 }}>
            💡 To pin to taskbar: right-click the desktop shortcut → "Pin to taskbar"
          </div>
        </div>
      </div>
    </div>
  );
}
