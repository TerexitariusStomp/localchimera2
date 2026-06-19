# OpenViking Integration

## Architecture: Single Container

OpenViking runs **inside the same container** as the Chimera Node.js app.
The `qvac/Dockerfile` bundles everything:

- Node.js runtime + `@qvac/sdk` (LLM inference + embedding)
- OpenViking server (`openviking-server`) with `llama-cpp-python`
- Local BGE embedding model (`bge-small-zh-v1.5-f16`)
- A startup script (`/app/start.sh`) that launches both services

No separate containers, sidecars, or manual OpenViking setup needed.

### How It Works

When the container starts:
1. `start.sh` launches OpenViking on `127.0.0.1:1933` in the background
2. Waits up to 60s for `/health` to return 200
3. Then starts the Chimera Node.js app on port 3002

Both processes share the same container filesystem and network namespace.

### Configuration

`upstream/openviking/ov.conf` (copied into the image at build time):

```json
{
  "default_account": "default",
  "default_user": "default",
  "storage": { "workspace": "/app/.openviking/data" },
  "embedding": {
    "dense": {
      "provider": "local",
      "model": "bge-small-zh-v1.5-f16",
      "dimension": 512
    }
  },
  "vlm": { "model": null, "api_key": null, "api_base": null },
  "server": {
    "host": "0.0.0.0",
    "port": 1933,
    "auth_mode": "api_key",
    "root_api_key": "chimera-local-dev-key"
  }
}
```

The bridge (`openviking_bridge.py`) connects to `http://127.0.0.1:1933`
with API key `chimera-local-dev-key` (user key auto-created on first start).

### Deployment Targets

All packages use the same single-container image:

| Target | How OpenViking Runs |
|---|---|
| **Docker / Podman** | Built into `qvac-chimera` image, started by `start.sh` |
| **Docker Compose** | Single service `qvac-chimera` with OpenViking inside |
| **Kubernetes** | Single container pod; OpenViking as background process |
| **Desktop (all OS)** | Supervisor starts one container; OpenViking inside |
| **Mobile** | Connects to remote instance (configurable `OPENVIKING_URL`) |

### Building the Image

```bash
cd qvac
podman build -f Dockerfile -t qvac-chimera:latest ..
```

## Current Status

- **OpenViking**: Bundled inside `qvac-chimera` image, runs on `127.0.0.1:1933` ✅
- **Bridge**: `openviking_bridge.py` connects via plain urllib ✅
- **Integration**: `server.js` stores wiki pages as memory on every save ✅
