# Production Tasking Architecture

This document defines the production architecture for Localchimera's decentralized resource marketplace using Golem, Mysterium, Edge Network, Streamr, BTFS, Namesilo, and optionally Logos.

## Overview

```
User
  │
  ▼
User-owned domain (Namesilo) → Edge Network CDN
  │
  ▼
Mysterium tunnel / ingress gateway
  │
  ▼
Golem activities (compute / inference / deployments)
  │
  ├── BTFS (durable storage)
  ├── Edge Network (CDN + edge key-value)
  ├── Streamr (real-time telemetry + state events)
  └── Casper (escrow / payments / identity)
```

## Components

### 1. Compute: Golem

Golem is the primary compute layer. The protocol acts as a requestor and rents provider capacity.

**Use cases:**
- **Deployments**: long-running Golem activities serving dynamic apps.
- **Templates**: pre-packaged GVMI images (Docker → GVMI).
- **SDL Builder**: replaced by Golem demand parameters (image hash, CPU, memory, GPU, price limits).
- **Create Rental**: fixed-duration Golem rentals paid by the hour.
- **Compute tasks**: batch jobs, generic tasks, and AI inference.

**Payment:** GLM on Polygon.

**Worker implementation:** `workers/resource-provisioner/src/provision/golem.js` receives orders, converts payment to GLM, and uses `golem-js` to rent providers and submit activities.

### 2. Tunnels: Mysterium

Mysterium provides decentralized VPN tunnels for ingress to Golem activities.

**Why:** Golem providers have dynamic IPs. A Mysterium tunnel exposes a stable, private entry point to the activity.

**Flow:**
1. Golem activity boots.
2. Mysterium client connects to the activity.
3. Traffic from the Edge Network CDN is routed through the Mysterium tunnel to the activity.

**Payment:** MYST (via protocol consumer wallet).

### 3. CDN: Edge Network

Edge Network provides a decentralized CDN for static assets, media, and caching.

**Use cases:**
- Static frontend assets (landing page, inference app).
- GVMI image distribution.
- Media streaming for AI output / video.
- API caching at the edge.

**Payment:** Edge Network has its own token economics; integration is via API.

### 4. Real-time data: Streamr + Edge Network Link

**Streamr** provides decentralized pub/sub for real-time data.

**Use cases:**
- Telemetry from Golem activities (CPU, memory, request rates).
- Log streaming.
- Scaling events (scale-up/scale-down signals).
- Durable event log for deployment state reconstruction.

**Payment:** DATA token.

**Edge Network Link** (`@edge/link`) provides a low-latency, cryptographically authenticated WebSocket layer for control-plane messaging.

**Use cases:**
- Direct worker ↔ activity communication.
- Low-latency scale commands.
- Heartbeat and health checks.

See `docs/EDGE_NETWORK_EVENT_BUS.md` for the full analysis.

**Payment:** EDGE / XE network.

### 5. State: Streamr + Edge Network + BTFS

State is split across the stack rather than stored in a single database:

- **Streamr** is the source of truth for event streams and current deployment state events.
- **Edge Network** provides edge key-value storage and CDN-backed manifests.
- **BTFS** provides durable snapshots and file archives.

**Use cases:**
- Deployment state events: published to Streamr.
- Deployment manifests: pinned to BTFS and cached by Edge Network.
- Active instance registry: reconstructed from the Streamr event log.
- Scaling config: stored in the worker and optionally mirrored to Edge Network.

**Why not a database:** The event log (Streamr) is the canonical state; Edge Network and BTFS provide durable snapshots and fast reads. This avoids a single mutable-state dependency.

### 6. DNS: Namesilo

Namesilo is used for domain registration and DNS management. Each app owner brings or buys their own domain.

**Use cases:**
- User buys a domain through the platform via Namesilo.
- Domain ownership belongs to the user, not the protocol.
- The worker adds DNS records pointing the domain to the Edge Network CDN or Mysterium tunnel endpoint.
- If the user bought the domain elsewhere, they can manually point it to the tunnel endpoint.

### 7. Storage: BTFS

BTFS remains the primary decentralized file storage.

**Use cases:**
- User files uploaded through the Storage tab.
- GVMI image backup.
- Log archives.

**Payment:** WBTT on BTTC.

### 8. Payments: Request Network + CoW Protocol

End users pay the protocol via Request Network. The protocol uses CoW Protocol to swap received tokens to resource tokens (GLM, WBTT, MYST, BTT, CSPR).

## Logos Analysis

Logos is a privacy-focused tech stack unifying three projects:

| Project | What it provides | Relevance to Localchimera |
|---------|------------------|----------------------------|
| **Codex** | Censorship-resistant durable storage | Could replace or supplement BTFS for long-term app storage. |
| **Nomos** | Private Layer 1 blockchain | Could replace Casper for escrow and coordination. |
| **Waku** | Privacy-preserving peer-to-peer messaging | Could replace Streamr for messaging/telemetry. |

### Verdict

Logos is promising but early. For production today:
- Use **Waku** as a Streamr alternative if stronger privacy is needed.
- Use **Codex** alongside BTFS for durability-critical data.
- **Nomos** is not yet a replacement for Casper's escrow contracts.

If Logos matures, it could collapse storage, messaging, and coordination into one integrated stack.

## Production flow

1. User selects a template (GVMI image) in the frontend.
2. Frontend creates a Request Network payment request.
3. User pays via Web3Auth.
4. Resource provisioner worker detects payment, swaps to resource tokens.
5. Worker provisions Golem activity with the selected GVMI.
6. Worker publishes the deployment state event to Streamr and opens a Mysterium tunnel.
7. Worker configures Edge Network CDN and Namesilo DNS for the user-owned domain.
8. Worker pins snapshots to BTFS and streams telemetry via Streamr.
9. User accesses the app via their own domain → Edge CDN → Mysterium tunnel → Golem activity.

## Production status

The following are now implemented as production-ready stubs in the resource provisioner:

1. **Golem provisioning** — `src/provision/golem.js` orchestrates activity creation.
2. **Mysterium tunnels** — `src/infra/mysterium-tunnel.js` opens/closes tunnels via HTTP API.
3. **Edge Network CDN** — `src/infra/edge-network.js` publishes and purges CDN content.
4. **Edge Network Link** — analyzed in `docs/EDGE_NETWORK_EVENT_BUS.md` for control-plane messaging.
5. **Streamr telemetry + state events** — `src/infra/streamr.js` publishes scaling, lifecycle, and deployment state events.
6. **Namesilo DNS** — `src/infra/namesilo.js` registers user-owned domains and manages DNS records.
7. **Scaling controller** — `src/scaling-controller.js` evaluates metrics and scales instances.
8. **Docker Compose** — `docker-compose.yml` runs the worker with Mysterium and BTFS sidecars.
9. **Deploy script** — `deploy.sh` builds and starts the production stack.

## Required production values

See `.env.example` in `workers/resource-provisioner/` for the full list. The critical ones are:

- `PRIVATE_KEY` — protocol EVM key.
- `EDGE_NETWORK_API_KEY`
- `STREAMR_NODE_PRIVATE_KEY` + `STREAMR_STREAM_ID`
- `NAMESILO_API_KEY` + `NAMESILO_CONTACT_PROFILE`
- `MYSTERIUM_API_URL`

## Missing runtime pieces

1. **GVMI image builder pipeline** — convert Docker images to GVMI and host them.
2. **Metrics source** — feed CPU/queue/latency into the scaling controller.
3. **Health check + replacement** — detect and restart failed Golem activities.
4. **BTFS snapshot automation** — periodically pin deployment state snapshots to BTFS.
5. **Logos integration** — evaluate Codex/Waku/Nomos as replacements once mature.

## Suggested deployment path

1. Configure `.env` with all API keys.
2. Run `./verify-production.sh`.
3. Run `./deploy.sh`.
4. Verify worker logs.
5. Trigger a test deployment via the frontend Billing tab.
