import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { Dashboard } from "./components/Dashboard";

function App() {
  const [supervisorRunning, setSupervisorRunning] = useState(false);
  const [loading, setLoading] = useState(false);

  const startSupervisor = async () => {
    setLoading(true);
    try {
      const res = await invoke<string>("start_supervisor");
      console.log(res);
      setSupervisorRunning(true);
    } catch (e) {
      console.error("Failed to start supervisor:", e);
    }
    setLoading(false);
  };

  const stopSupervisor = async () => {
    setLoading(true);
    try {
      await invoke<string>("stop_supervisor");
      setSupervisorRunning(false);
    } catch (e) {
      console.error("Failed to stop supervisor:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    invoke<boolean>("supervisor_status").then(setSupervisorRunning).catch(() => {});
  }, []);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "100vh",
      background: "#0e0d0b",
      color: "#b0a898",
      fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
    }}>
      <header style={{
        padding: "16px 24px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background: "linear-gradient(135deg, #00e5ff, #a855f7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: "#000" }}>C</span>
          </div>
          <span style={{ fontWeight: 700, fontSize: 16, color: "#e8e2d8" }}>Chimera</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: supervisorRunning ? "#86efac" : "#7a7468" }}>
            {supervisorRunning ? "● Supervisor running" : "○ Supervisor stopped"}
          </span>
          {!supervisorRunning ? (
            <button
              onClick={startSupervisor}
              disabled={loading}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "none",
                background: "#c9a96e",
                color: "#0e0d0b",
                fontWeight: 600,
                fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Starting..." : "Start Supervisor"}
            </button>
          ) : (
            <button
              onClick={stopSupervisor}
              disabled={loading}
              style={{
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.1)",
                background: "transparent",
                color: "#fca5a5",
                fontWeight: 600,
                fontSize: 13,
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? "Stopping..." : "Stop Supervisor"}
            </button>
          )}
        </div>
      </header>
      <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {supervisorRunning ? (
          <Dashboard />
        ) : (
          <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            gap: 16,
          }}>
            <h1 style={{ fontSize: 28, fontWeight: 700, color: "#e8e2d8", margin: 0 }}>
              Local AI that earns when idle.
            </h1>
            <p style={{ fontSize: 15, color: "#7a7468", maxWidth: 480, textAlign: "center", lineHeight: 1.7 }}>
              Chimera runs a local AI node inside a Docker container.
              Click <strong>Start Supervisor</strong> to begin.
            </p>
            <p style={{ fontSize: 13, color: "#4a4540", maxWidth: 400, textAlign: "center" }}>
              Requires Docker Desktop or Docker Engine. The supervisor will pull the <code>chimera:latest</code> image and start the container.
            </p>
            <button
              onClick={() => open("https://github.com/TerexitariusStomp/qvac-chimera")}
              style={{
                padding: "8px 18px",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.08)",
                background: "#161410",
                color: "#b0a898",
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              View on GitHub →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
