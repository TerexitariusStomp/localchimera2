# Chimera Desktop

Cross-platform desktop shell for Chimera. Packages the Docker-based app backend behind a native desktop installer with a supervisor sidecar for container orchestration.

## Architecture

```
┌─────────────────────────────────────┐
│  Tauri Desktop App (React UI)       │
│  - Start/stop controls              │
│  - Logs, status, settings           │
│  - Links to open app in browser     │
└─────────────┬─────────────────────┘
              │ spawn sidecar
┌─────────────▼─────────────────────┐
│  Go Supervisor Sidecar            │
│  - Docker runtime detection       │
│  - Pull/start/stop container      │
│  - Health checks                  │
│  - Stream container logs            │
│  - HTTP API on :9876              │
└─────────────┬─────────────────────┘
              │ docker CLI / API
┌─────────────▼─────────────────────┐
│  Container Runtime                │
│  - chimera:latest image           │
│  - LLM Wiki + miner node          │
│  - Exposes localhost:3002         │
└───────────────────────────────────┘
```

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://rustup.rs/)
- [Go](https://go.dev/dl/) 1.21+ (for sidecar builds)
- Docker Desktop or Docker Engine (for runtime)

Linux also needs GTK/WebKit development libraries:

```bash
# Fedora/RHEL
sudo dnf install glib2-devel gtk3-devel webkit2gtk3-devel libappindicator-gtk3-devel librsvg2-devel

# Ubuntu/Debian
sudo apt install libgtk-3-dev libwebkit2gtk-4.0-dev libappindicator3-dev librsvg2-dev
```

## Development

```bash
# 1. Install JS dependencies
npm install

# 2. Start the Tauri dev server
npm run tauri:dev
```

## Build

```bash
# Build supervisor sidecar (Go)
cd supervisor
go build -o supervisor main.go

# Copy to Tauri bin directory (Linux example)
cp supervisor ../src-tauri/bin/supervisor-x86_64-unknown-linux-gnu

# Build desktop app
npm run tauri:build
```

Tauri will produce platform-specific installers in `src-tauri/target/release/bundle/`:
- `.msi` (Windows)
- `.dmg` / `.app` (macOS)
- `.AppImage` / `.deb` / `.rpm` (Linux)

## How it works

1. **User installs** the desktop app (one native installer per OS).
2. **First run**: Tauri spawns the Go supervisor as a bundled sidecar.
3. **Supervisor** detects Docker, pulls `chimera:latest`, and starts the container.
4. **Container** runs the full Chimera stack (LLM Wiki + miner node) on `localhost:3002`.
5. **Desktop UI** shows status, logs, and an "Open App" button that launches the browser.
6. **User** can start/stop the container from the desktop tray without touching Docker.

## Supervisor API

The Go supervisor exposes a local HTTP API on port `9876`:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/status` | GET | `{running, docker_present, logs, error, app_url}` |
| `/start` | POST | Pull image, start container, wait for health |
| `/stop` | POST | Stop and remove container |
| `/logs` | GET | Plain-text container logs |

## Security

- The desktop UI never calls Docker directly — only the supervisor does.
- The supervisor uses the Docker CLI (not the socket API) for simplicity.
- The container runs least-privilege with isolated volumes.
- Future: add policy engine for per-workload allowlists.
