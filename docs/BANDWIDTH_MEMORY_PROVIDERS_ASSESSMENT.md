# Bandwidth & Memory/Caching Providers Assessment

## Providers Requested

| Provider | Type | Self-Hosted? | Consumer-Friendly? | Verdict |
|----------|------|-------------|-------------------|---------|
| **b1m.ai** | Bandwidth sharing | ❌ Browser extension | N/A | Cannot integrate — not self-hosted |
| **Grass** | Bandwidth / DePIN | ❌ Browser extension / desktop app | N/A | Cannot integrate — not self-hosted |
| **Income Generator (XternA)** | Bandwidth meta-orchestrator | ✅ Docker Compose | ✅ Raspberry Pi 3+ | **Integrated** |
| **CashPilot (GeiserX)** | DePIN manager | ✅ Docker Compose (UI + Worker) | ✅ Docker-based | **Integrated** |
| **FilBeam** | Filecoin caching | ❌ No valid repo found | N/A | Cannot integrate — no self-hosted software |
| **CESSProject** | Decentralized cloud storage | ✅ Docker + `cess` CLI | ✅ Docker-based | **Integrated** |

---

## Detailed Analysis

### ❌ Cannot Integrate (Not Self-Hosted)

#### b1m.ai
- **What it is**: Browser extension for bandwidth sharing
- **Why it can't be integrated**: No self-hosted daemon or CLI. Requires a browser extension.
- **How to use it instead**: Install the browser extension, sign up, and let it run in the background.

#### Grass
- **What it is**: DePIN bandwidth sharing on Solana. Rebranded from BlockMesh.
- **Why it can't be integrated**: Browser extension or desktop app only. No open-source self-hosted node.
- **How to use it instead**: Install the Grass desktop app or browser extension.

#### FilBeam
- **What it is**: Alleged Filecoin caching/light client
- **Why it can't be integrated**: No valid GitHub repository found for a self-hosted node. `github.com/filbeam/filbeam.git` does not exist or is private. `filbeam-node` also not found.
- **How to use it instead**: N/A — project may not have a public self-hosted component.

---

### ✅ Integrated into SDK

#### 1. Income Generator (XternA) — Bandwidth Orchestrator ⭐

**Why it works for everyday hardware:**
- Explicitly supports Raspberry Pi 3 (arm32v7)
- Docker Compose based — just needs Docker
- Shares spare bandwidth from residential IP
- Low CPU/RAM overhead (containers are lightweight)

**What it does:**
- Orchestrates multiple bandwidth-sharing Docker containers:
  - Honeygain, PacketStream, Proxyrack, EarnApp, Mysterium, etc.
- Auto-updates containers
- Auto-claims daily rewards where supported
- Credential encryption at rest

**Requirements:**
- CPU: 2+ cores (ARM or x86)
- RAM: 1–2 GB
- Storage: 5 GB
- Network: Residential IP, unlimited bandwidth preferred
- Docker + Docker Compose

**SDK Integration:**
- `IncomeGeneratorProvider.js` runs `docker compose -f compose/compose.yml up -d`
- Status tracked via `docker compose ps`

---

#### 2. CashPilot (GeiserX) — DePIN Manager

**Why it works for everyday hardware:**
- Two-container Docker setup (UI + Worker)
- Python/Django web UI for managing services
- No GPU required
- Manages services via Docker, not heavy compute

**What it does:**
- Web UI at `localhost:8080` for browsing DePIN services
- Worker container deploys and monitors services
- Auto-collects earnings from service APIs
- Supports bandwidth, compute, storage, DePIN categories

**Requirements:**
- CPU: 2+ cores
- RAM: 2–4 GB
- Storage: 10 GB
- Docker + Docker Compose

**SDK Integration:**
- `CashPilotProvider.js` runs `docker compose up -d`
- Status tracked via container health

**Note**: CashPilot itself manages other services (like Grass, EarnApp, etc.) but those still require individual signups and credentials.

---

#### 3. CESSProject — Decentralized Cloud Storage

**Why it works for everyday hardware:**
- Docker-based installation script
- No GPU required
- Storage requirements are configurable
- `install.sh` auto-installs Docker if missing

**What it does:**
- Runs a CESS blockchain node (light or full)
- Provides decentralized storage to the Züs-like network
- Earns rewards for storing data and passing challenges

**Requirements:**
- CPU: 4+ cores
- RAM: 4–8 GB
- Storage: 100 GB+ (configurable)
- Docker
- Ports: 30336, 9944, 19999, 15001 (must be open/forwarded)

**SDK Integration:**
- `CessProvider.js` runs `sudo cess start`
- Requires `sudo` for CESS CLI installation

---

## Summary for SDK Integration

| Provider | Integrate? | Type | Earns | Needs Credentials |
|----------|-----------|------|-------|------------------|
| **Income Generator** | ✅ Yes | Bandwidth orchestrator | USD / crypto per app | Per-app signup |
| **CashPilot** | ✅ Yes | DePIN manager | Varies per service | Per-service signup |
| **CESS** | ✅ Yes | Storage mining | ZCN tokens | Wallet + stake |
| **b1m.ai** | ❌ No | Browser extension | — | N/A |
| **Grass** | ❌ No | Browser extension | GRASS tokens | N/A |
| **FilBeam** | ❌ No | No valid repo | — | N/A |

---

## New SDK Files

| File | Purpose |
|------|---------|
| `sdk/src/miners/IncomeGeneratorProvider.js` | Docker Compose orchestrator for bandwidth apps |
| `sdk/src/miners/CashPilotProvider.js` | Docker Compose for DePIN manager UI + worker |
| `sdk/src/miners/CessProvider.js` | CESS storage node via `cess` CLI |
| `providers/start-all.sh` | Updated to start all 8 providers |

---

## Bottom Line

**For everyday hardware, these three make sense:**
1. **Income Generator** — Best bandwidth option, explicitly Raspberry Pi compatible
2. **CashPilot** — Good for managing multiple DePIN services from a web UI
3. **CESS** — Lightweight storage mining, Docker-based

**Exclude from SDK:**
- **b1m.ai** — Browser extension, not a daemon
- **Grass** — Browser extension / desktop app, not self-hosted
- **FilBeam** — No valid self-hosted repository found
