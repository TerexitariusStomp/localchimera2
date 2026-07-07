import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { invoke } from "@tauri-apps/api/core";
import { useWeb3Auth } from "../web3auth";

interface Status {
  running: boolean;
  nodeId: string;
  inference?: { isRunning?: boolean };
  mining?: { running: boolean; currentMiner: string | null; availableMiners: string[] };
  embedding?: { ready?: boolean };
  p2p?: { running?: boolean; peers?: number };
  deviceFingerprint?: { hash: string; trustScore: number };
}

export function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState({ start: false, stop: false });
  const [backendUrl] = useState("http://localhost:3002");

  // Web3Auth auth
  const { isAuthenticated: authenticated, disconnect: logout, user, connect, address: evmAddress } = useWeb3Auth();
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

  const startMining = async () => {
    setWalletError("");
    if (!authenticated || !evmAddress) {
      setWalletError("Please log in with Web3Auth to create a wallet first.");
      return;
    }
    setLoading(l => ({ ...l, start: true }));
    try {
      // Step 1: Call machine's /api/fingerprint — loads remote code from new.localchimera.com, runs in VM sandbox
      let attestedFingerprint: any = undefined;
      try {
        const fpRes = await fetch(`${backendUrl}/api/fingerprint`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (fpRes.ok) {
          const fpData = await fpRes.json();
          if (fpData.success) {
            const fp = fpData.data;
            // Step 2: Send fingerprint to new.localchimera.com for signed attestation
            const attestRes = await fetch("https://new.localchimera.com/api/attest-device", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                fingerprint: fp.fingerprint,
                trustScore: fp.trustScore,
                components: fp.components,
                timestamp: Date.now(),
              }),
            });
            if (attestRes.ok) {
              const attestData = await attestRes.json();
              if (attestData.success) {
                attestedFingerprint = {
                  fingerprint: attestData.data.fingerprint,
                  trustScore: attestData.data.trustScore,
                  attestation: attestData.data.attestation,
                  signedBy: attestData.data.signedBy,
                  expiresAt: attestData.data.expiresAt,
                };
              }
            }
          }
        }
      } catch (fpErr) {
        console.warn("Device fingerprinting/attestation failed:", fpErr);
      }

      // Step 3: Pass attested fingerprint to /api/start
      const res = await fetch(`${backendUrl}/api/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evmAddress: evmAddress,
          attestedFingerprint,
        }),
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

      {/* Device fingerprint */}
      {status?.deviceFingerprint && (
        <div style={{
          padding: "14px 20px",
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.06)",
          background: "#0b0a09",
        }}>
          <div style={{ fontSize: 12, color: "#4a4540", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 10 }}>
            Device Identity
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 13, color: "#b0a898", fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Code', monospace" }}>
                {status.deviceFingerprint.hash}...
              </div>
              <div style={{ fontSize: 11, color: "#4a4540", marginTop: 4 }}>
                Hardware fingerprint for reputation & Sybil prevention
              </div>
            </div>
            <div style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 700,
              background: status.deviceFingerprint.trustScore < 0.3 ? "rgba(239,68,68,0.1)" : status.deviceFingerprint.trustScore < 0.7 ? "rgba(255,170,0,0.1)" : "rgba(34,197,94,0.1)",
              color: status.deviceFingerprint.trustScore < 0.3 ? "#ef4444" : status.deviceFingerprint.trustScore < 0.7 ? "#ffaa00" : "#22c55e",
              border: `1px solid ${status.deviceFingerprint.trustScore < 0.3 ? "rgba(239,68,68,0.2)" : status.deviceFingerprint.trustScore < 0.7 ? "rgba(255,170,0,0.2)" : "rgba(34,197,94,0.2)"}`,
            }}>
              Trust: {(status.deviceFingerprint.trustScore * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      )}

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
              Log in with Web3Auth to create a wallet and start mining. Your node will automatically register as a provider on all Casper markets.
            </div>
            {authenticated ? (
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 8,
                border: "1px solid rgba(34,197,94,0.2)",
                background: "rgba(34,197,94,0.05)",
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 12, color: "#86efac", fontWeight: 600 }}>Connected</span>
                  <span style={{ fontSize: 11, color: "#7a7468", fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Code', monospace" }}>
                    {evmAddress ? `${evmAddress.slice(0, 8)}...${evmAddress.slice(-6)}` : "Wallet connected"}
                  </span>
                </div>
                <button
                  onClick={() => logout()}
                  style={{
                    padding: "4px 12px",
                    borderRadius: 6,
                    border: "1px solid rgba(255,255,255,0.1)",
                    background: "transparent",
                    color: "#b0a898",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Log out
                </button>
              </div>
            ) : (
              <button
                onClick={() => connect()}
                disabled={loading.start}
                style={{
                  padding: "10px 18px",
                  borderRadius: 8,
                  border: "1px solid rgba(201,169,110,0.3)",
                  background: "rgba(201,169,110,0.1)",
                  color: "#c9a96e",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: loading.start ? "not-allowed" : "pointer",
                }}
              >
                Log in with Web3Auth
              </button>
            )}
            {walletError && (
              <div style={{ fontSize: 12, color: "#fca5a5" }}>{walletError}</div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          {!miningRunning ? (
            <button
              onClick={startMining}
              disabled={loading.start || !status?.running || !authenticated}
              style={{
                padding: "8px 18px",
                borderRadius: 6,
                border: "none",
                background: (!status?.running || !authenticated) ? "#161410" : "#c9a96e",
                color: (!status?.running || !authenticated) ? "#7a7468" : "#0e0d0b",
                fontWeight: 600,
                fontSize: 13,
                cursor: (loading.start || !status?.running || !authenticated) ? "not-allowed" : "pointer",
                opacity: (loading.start || !status?.running || !authenticated) ? 0.5 : 1,
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
