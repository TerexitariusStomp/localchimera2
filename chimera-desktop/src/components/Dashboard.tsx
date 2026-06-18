import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-shell";

interface Status {
  running: boolean;
  docker_present: boolean;
  logs: string;
  error: string;
  app_url: string;
}

export function Dashboard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState({ start: false, stop: false });
  const logsRef = useRef<HTMLDivElement>(null);

  const apiBase = "http://localhost:";
  const supervisorPort = "9876";

  const fetchStatus = async () => {
    if (!supervisorPort) return;
    try {
      const res = await fetch(`${apiBase}${supervisorPort}/status`);
      const data = await res.json();
      setStatus(data);
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (logsRef.current && status?.logs) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight;
    }
  }, [status?.logs]);

  const startApp = async () => {
    setLoading(l => ({ ...l, start: true }));
    try {
      await fetch(`${apiBase}${supervisorPort}/start`, { method: "POST" });
      await fetchStatus();
    } catch {}
    setLoading(l => ({ ...l, start: false }));
  };

  const stopApp = async () => {
    setLoading(l => ({ ...l, stop: true }));
    try {
      await fetch(`${apiBase}${supervisorPort}/stop`, { method: "POST" });
      await fetchStatus();
    } catch {}
    setLoading(l => ({ ...l, stop: false }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 800, margin: "0 auto" }}>
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
            Container Status
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: status?.running ? "#86efac" : "#fca5a5" }}>
            {status?.running ? "🟢 Running" : "⚪ Stopped"}
          </div>
          {status?.docker_present === false && (
            <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 4 }}>
              Docker not detected — install Docker Desktop
            </div>
          )}
          {status?.error && (
            <div style={{ fontSize: 12, color: "#fca5a5", marginTop: 4 }}>
              Error: {status.error}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          {!status?.running ? (
            <button
              onClick={startApp}
              disabled={loading.start}
              style={{
                padding: "8px 18px",
                borderRadius: 6,
                border: "none",
                background: "#c9a96e",
                color: "#0e0d0b",
                fontWeight: 600,
                fontSize: 13,
                cursor: loading.start ? "not-allowed" : "pointer",
                opacity: loading.start ? 0.6 : 1,
              }}
            >
              {loading.start ? "Starting..." : "▶ Start App"}
            </button>
          ) : (
            <button
              onClick={stopApp}
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
              {loading.stop ? "Stopping..." : "⏹ Stop App"}
            </button>
          )}
          {status?.app_url && (
            <button
              onClick={() => open(status.app_url)}
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
          )}
        </div>
      </div>

      {/* Logs */}
      <div>
        <div style={{ fontSize: 12, color: "#4a4540", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: 600, marginBottom: 8 }}>
          Logs
        </div>
        <div
          ref={logsRef}
          style={{
            background: "#0b0a09",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 10,
            padding: 14,
            height: 320,
            overflow: "auto",
            fontFamily: "ui-monospace, SFMono-Regular, 'Cascadia Code', 'Fira Code', monospace",
            fontSize: 12,
            lineHeight: 1.6,
            color: "#7a7468",
            whiteSpace: "pre-wrap",
          }}
        >
          {status?.logs || "No logs yet. Start the app to see output."}
        </div>
      </div>
    </div>
  );
}
