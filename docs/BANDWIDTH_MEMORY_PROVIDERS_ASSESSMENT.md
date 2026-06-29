# Bandwidth & Memory/Caching Providers Assessment

> **Archived**: The self-hosted providers below (Income Generator, CashPilot, CESS) have been **removed from the Localchimera codebase** because they require per-app credentials or a local wallet/config on the machine and cannot safely run on untrusted hardware. This document is kept as an assessment archive.

## Providers Requested

| Provider | Type | Self-Hosted? | Consumer-Friendly? | Verdict |
|----------|------|-------------|-------------------|---------|
| **b1m.ai** | Bandwidth sharing | ❌ Browser extension | N/A | Cannot integrate — not self-hosted |
| **Grass** | Bandwidth / DePIN | ❌ Browser extension / desktop app | N/A | Cannot integrate — not self-hosted |
| **Income Generator (XternA)** | Bandwidth meta-orchestrator | ✅ Docker Compose | ✅ Raspberry Pi 3+ | **Removed from Localchimera** — per-app credentials required |
| **CashPilot (GeiserX)** | DePIN manager | ✅ Docker Compose (UI + Worker) | ✅ Docker-based | **Removed from Localchimera** — per-service credentials required |
| **FilBeam** | Filecoin caching | ❌ No valid repo found | N/A | Cannot integrate — no self-hosted software |
| **CESSProject** | Decentralized cloud storage | ✅ Docker + `cess` CLI | ✅ Docker-based | **Removed from Localchimera** — local wallet/config required |

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

### ⚠️ Removed from Localchimera (not in SDK or node)

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

**Why removed from Localchimera:**
- Requires per-app credentials on the local machine (Honeygain, PacketStream, Proxyrack, EarnApp, etc.).
- Upstream is a Docker Compose wrapper around closed-source apps; no relay/worker split is supported.
- Original upstream: `https://github.com/XternA/income-generator.git`

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

**Why removed from Localchimera:**
- Requires per-service credentials on the local machine.
- Upstream is a self-hosted credential manager for other DePIN services; no relay/worker split is supported.
- Original upstream: `https://github.com/GeiserX/CashPilot.git`

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

**Why removed from Localchimera:**
- Requires a local wallet/config and `sudo` for the CESS CLI.
- The CESS node is a blockchain participant that signs storage proofs and on-chain transactions locally; no relay/worker split is supported.
- Original upstream: `https://github.com/CESSProject/cess-nodeadm.git`

---

## Other Removed Providers (Compute / GPU)

These have been removed from the Localchimera codebase because they require a wallet, API key, or account credentials on the local machine. See `docs/RELAY_COMPATIBILITY.md` for the detailed per-protocol analysis of why a relay/worker split is not supported by their upstream protocols.

| Provider | Type | Why removed |
|---|---|---|
| **Salad** | Job queue worker | Salad account credentials required |
| **Heurist** | GPU/LLM miner | Local identity wallet required |
| **Lium** | GPU marketplace CLI | Bittensor wallet / API key required |
| **Nosana** | Solana compute kit | Solana wallet / API key required |
| **ByteLeap** | Bittensor GPU miner | Bittensor wallet required |

---

## Summary

| Provider | Localchimera? | Type | Needs Credentials |
|----------|---------------|------|------------------|
| **Income Generator** | ❌ Removed | Bandwidth orchestrator | Per-app signup |
| **CashPilot** | ❌ Removed | DePIN manager | Per-service signup |
| **CESS** | ❌ Removed | Storage mining | Wallet + stake |
| **Salad** | ❌ Removed | Job queue worker | Salad account credentials |
| **Heurist** | ❌ Removed | GPU/LLM miner | Local identity wallet |
| **Lium** | ❌ Removed | GPU marketplace CLI | Bittensor wallet / API key |
| **Nosana** | ❌ Removed | Solana compute kit | Solana wallet / API key |
| **ByteLeap** | ❌ Removed | Bittensor GPU miner | Bittensor wallet |
| **b1m.ai** | ❌ Cannot integrate | Browser extension | N/A |
| **Grass** | ❌ Cannot integrate | Browser extension / desktop app | N/A |
| **FilBeam** | ❌ Cannot integrate | No valid repo | N/A |

---

## Bottom Line

These bandwidth, storage, and compute providers are **not included in Localchimera** because they require credentials or a wallet on the local machine, making them unsafe for untrusted hardware. Their upstream protocols also do not support a relay/worker split that would let a trusted relay hold the key while an untrusted worker provides the resource.

**Cannot integrate:**
- **b1m.ai** — Browser extension, not a daemon
- **Grass** — Browser extension / desktop app, not self-hosted
- **FilBeam** — No valid self-hosted repository found
