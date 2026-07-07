# Localchimera Documentation

> This document is generated from the repository READMEs. Edit the README files and run `npm run generate-docs` to update it.


---

## PROJECT OVERVIEW

<!-- Source: README.md -->


A standalone QVAC inference node running `@localchimera/sdk` inside a hardened Docker container. Each device (desktop, mobile) is its own autonomous node — no centralized router, no relay server.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Desktop: Tauri Shell + WebView                     │
│  - Bundled frontend (Wiki-first, auto-save)         │
│  - Native Start/Stop controls                       │
│  - IPC → Rust backend → Docker (or direct Node.js)│
└────────────────────┬────────────────────────────────┘
                     │
┌────────────────────▼────────────────────────────────┐
│  Hardened Docker Container (preferred)              │
│  - Non-root user (chimera)                          │
│  - Multi-stage build, health checks               │
│  - Node.js backend: miners, P2P, wiki API          │
│  - LLM Wiki with auto-save (2s debounce)           │
└─────────────────────────────────────────────────────┘
         or (fallback when Docker unavailable)
┌─────────────────────────────────────────────────────┐
│  Direct Node.js Process                             │
│  - Same codebase, no container isolation            │
│  - start-auto.sh handles deps + build              │
└─────────────────────────────────────────────────────┘
```

## Platforms

| Platform | Install | Status |
|---|---|---|
| **Linux (.deb)** | `sudo dpkg -i apps/desktop/src-tauri/target/release/bundle/deb/Chimera_1.0.0_amd64.deb` | Ready |
| **Linux (.rpm)** | `sudo rpm -i apps/desktop/src-tauri/target/release/bundle/rpm/Chimera-1.0.0-1.x86_64.rpm` | Ready |
| **Linux (binary)** | `./apps/desktop/src-tauri/target/release/chimera-desktop` | Ready |
| **macOS** | Build from source (see below) | Source |
| **Windows** | Build from source (see below) | Source |
| **iOS** | App Store submission pending | Capacitor configured |
| **Android** | Play Store submission pending | Capacitor configured |
| **Docker** | `cd qvac && docker-compose up -d` | Ready |

## Quick Start (Docker)

```bash
cd qvac
docker-compose up -d
# Open http://localhost:3002 — wiki loads immediately
```

## Quick Start (Desktop — Linux)

```bash
# Install .deb
sudo dpkg -i apps/desktop/src-tauri/target/release/bundle/deb/Chimera_1.0.0_amd64.deb

# Or run binary directly
./apps/desktop/src-tauri/target/release/chimera-desktop
```

## Quick Start (Mobile — iOS/Android)

The mobile app is a Capacitor-wrapped web app that runs `@localchimera/sdk` natively on device. Each phone is a standalone node — no relay, no desktop dependency.

```bash
cd qvac/frontend
npm install && npm run build
npx cap sync

# iOS → Xcode → Archive → App Store
npx cap open ios

# Android → Android Studio → Generate Signed Bundle → Play Store
npx cap open android
```

All platforms open directly to the LLM Wiki with auto-save.

## Integrate Chimera Into Your Own App or Website

You don't have to use the Chimera app generator to add Chimera to a project. Both SDKs are published to npm and can be integrated directly.

**Websites and browser apps**

Install the browser SDK and start a lightweight relay node in one line:

```bash
npm install @localchimera/browser-sdk
```

```js
import { quickStart } from '@localchimera/browser-sdk';

// Relay mode — no wallet required
await quickStart();
```

For wallet-connected modes, pass the provider, public key, and account hash:

```js
await quickStart(provider, publicKeyHex, accountHash, {
  onStatus: (status) => console.log(status),
});
```

**Downloaded/device apps (React, React Native, Tauri, Electron, desktop, tablet, mobile)**

Install the app SDK and drop in the self-contained button:

```bash
npm install @localchimera/sdk
```

```jsx
import { ChimeraButton } from '@localchimera/sdk';

function App() {
  return <ChimeraButton appDeveloperEVM="0xYourPayoutAddress" />;
}
```

`ChimeraButton` handles wallet connection, mining enable/disable, earnings display, and all network adapters automatically. It is self-contained and requires no external CSS or wrapping providers.

## Build from Source

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- Rust (for Tauri desktop)

### 1. Backend (Docker)
```bash
cd qvac
npm install
cd frontend && npm install && npm run build && cd ..
docker-compose up --build -d
```

### 2. Desktop App (Tauri)
```bash
cd apps/desktop
npm install
npm run tauri:build
# Output: src-tauri/target/release/bundle/
```

### 3. Mobile (Capacitor)
```bash
cd qvac/frontend
npm install && npm run build
npx cap sync
npx cap open ios      # Xcode → Archive → App Store
npx cap open android  # Android Studio → Generate Signed Bundle
```

## Key Features

- **LLM Wiki** — Opens directly, no landing page. Auto-saves every 2s.
- **Time-ago indicator** — "Last saved 12s ago" beside Delete button.
- **Chimera SDK** — `@localchimera/sdk` powers all inference (QVAK).
- **Standalone** — Each device is its own node. No InferenceRouter, no relay.
- **Hardened** — Docker container runs as non-root with minimal deps.
- **P2P** — Pear P2P swarm sync for wiki pages across devices.
- **Mining** — BTT AI, Golem, Anyone Protocol, Mysterium, BTFS (walletless storage), Casper miners. Resources are paid for via the frontend using Web3Auth + Request Network; the protocol auto-converts payments to the resource's native token.
- **Fleet** — Commander/worker orchestration for distributed tasks.

### New: Enhanced Inference & Security Modules

- **Proof-of-Inference Receipts** — Every inference answer is hashed into a Merkle chain and signed (secp256k1), producing portable, independently verifiable receipts. (`qvac/src/inference/ProofOfInference.js`)
- **Inference Serialization Queue** — Requests queue through a promise chain to prevent concurrent model collisions on single-GPU/CPU devices. (`qvac/src/inference/InferenceQueue.js`)
- **Prompt Injection Defense** — Untrusted content (documents, RAG context) is fenced in `<document>` tags with a guard preamble. Injection heuristics detect re-instruction attempts. (`qvac/src/inference/PromptGuard.js`)
- **Prompt Budgeting** — Character-budgeted prompt construction against `ctx_size` with answer reserve, document ratio, and history ratio. (`qvac/src/inference/PromptBudgeter.js`)
- **Pay-Per-Token USDT Settlement** — Per-session token metering with USDT spend caps and on-chain settlement tracking. (`qvac/src/inference/TokenMeter.js`)
- **Voice Transcription Pipeline** — On-device Whisper STT → Llama summary + action items → GTE embeddings → RAG ingest. Models loaded one at a time (load → infer → unload). (`qvac/src/inference/VoicePipeline.js`)
- **Agent Tool-Calling Loop** — On-device agent that calls tools (search_memory, list_todos, calculator, local_time, search_wiki) with streaming citations. Hardened via PromptGuard + PromptBudgeter. (`qvac/src/inference/AgentLoop.js`)
- **Document Chunking + Citations** — Semantic paragraph/sentence chunking with stable IDs (DOC-XX-NN) and a citation registry for grounded answers. (`qvac/src/inference/DocumentChunker.js`)
- **Content-Addressed Verification** — SHA-256 content hashes for wiki pages, inference receipts, and RAG documents. Merkle proof construction and verification. (`qvac/src/core/ContentAddress.js`)
- **Signed Capability Manifests** — Peers advertise model inventory, dataset opt-ins, and provider availability via signed manifests over P2P. Enables intelligent inference delegation. (`qvac/src/p2p/CapabilityManifest.js`)
- **Deployment Lifecycle + SSE** — Phase-based deployment tracking (uploaded → prepared → submitted → matching → matched → ack → env-set → started → model_loading → model_ready) with live progress streamed over Server-Sent Events. (`qvac/src/core/DeploymentLifecycle.js`)
- **Peer Reputation / Trust Scoring** — Peers scored by success rate, latency, and uptime. Scores feed into weighted device selection in InferenceRouter. Decays toward neutral over time (forgiveness). (`qvac/src/p2p/PeerReputation.js`)
- **Circuit Breaker** — If a device/peer fails N times consecutively, the circuit trips and blocks routing for a cooldown. Half-open probe tests recovery before full reset. (`qvac/src/inference/CircuitBreaker.js`)
- **TTFT Measurement** — Time-To-First-Token is measured during streaming inference and logged in audit records alongside tokensPerSec. (`qvac/src/inference/QVACInferenceLayer.js`)
- **Model Hot-Swapping** — Switch between models (e.g., Llama for text, Whisper for voice) without restarting the inference layer. LRU cache with configurable max cached models. (`qvac/src/inference/QVACInferenceLayer.js`)
- **On-chain PoI Verification** — Solidity contract that verifies secp256k1-signed inference receipts on-chain via ecrecover, enabling trustless USDT settlement. (`contracts/ProofOfInferenceVerifier.sol`)
- **Memory Compaction** — When PromptBudgeter would drop old history, MemoryCompactor summarizes it into a compact context message instead of truncating. LLM-based with extractive fallback. (`qvac/src/inference/MemoryCompactor.js`)
- **Knowledge Graph** — Entity-relationship store for transcripts and documents. Supports fuzzy search, subgraph traversal (BFS), and source-filtered queries. Integrates with VoicePipeline entity extraction. (`qvac/src/inference/KnowledgeGraph.js`)
- **Encrypted Document Storage** — Per-workspace AES-256-GCM encryption for sensitive RAG documents. HKDF-derived workspace keys from a master key. Transparent encrypt/decrypt for HypercoreStore. (`qvac/src/storage/CryptoVault.js`)
- **Peer Receipt Cross-Verification** — P2P gossip protocol where peers independently verify inference receipts and broadcast results. Community verification threshold enables trustless verification without gas. (`qvac/src/inference/ReceiptGossip.js`)
- **Dynamic Pricing** — Demand-based token pricing that adjusts per-token cost based on queue depth (demand) and available peers (supply). Bounded by min/max price limits. (`qvac/src/inference/ReceiptGossip.js`)
- **Model Registry** — Catalog of available models with metadata (context length, quantization, type, load status). Integrates with hot-swapping and capability manifests. (`qvac/src/inference/ModelRegistry.js`)
- **Tool Result Cache** — Caches agent tool call results with TTL and content-aware invalidation. Avoids redundant computation for repeated tool calls. (`qvac/src/inference/ToolResultCache.js`)
- **Semantic Deduplication** — Detects near-duplicate documents via cosine similarity before RAG ingestion. Prevents duplicate content from polluting search results. (`qvac/src/inference/SemanticDedup.js`)
- **SLA Enforcement** — Per-request timeout with SLA levels (standard/priority/batch). Aborts hung requests and triggers refunds. Tracks timeout rates and avg duration. (`qvac/src/inference/SLAEnforcer.js`)
- **Content Pinning** — Replicates important content (receipts, wiki pages) to N peers via P2P for durability. Encrypted pinning with CryptoVault integration. (`qvac/src/p2p/ContentPinner.js`)
- **Deployment Rollback** — Automatic rollback to last known-good phase on deployment failure. Manual rollback via API. Tracks rollback history. (`qvac/src/core/DeploymentLifecycle.js`)
- **Task Decomposition** — Breaks complex inference requests into sub-tasks for parallel execution across peers. LLM-based and heuristic decomposition with result synthesis. (`qvac/src/inference/TaskDecomposer.js`)
- **Conversation Branching** — Tree-based conversation model with branching from any message. Explore alternative responses without losing the original thread. (`qvac/src/inference/ConversationBrancher.js`)
- **Model Benchmarking CLI** — Standalone CLI tool for benchmarking models: TTFT, tokens/sec, latency across multiple prompts with comparison tables. (`qvac/src/cli/benchmark.js`)
- **Auto-Tagging** — Automatically tags documents and transcripts using taxonomy matching, keyword extraction, entity lookup, and optional LLM-based tagging. (`qvac/src/inference/AutoTagger.js`)
- **Conversation Export** — Export branched conversations as JSON, Markdown, plain text, OpenAI-compatible format, or CSV. Full tree or active-path-only export. (`qvac/src/inference/ConversationExporter.js`)
- **Confidence Router** — Self-consistency check: samples the local model k times, measures answer stability via embedding cosine similarity, and decides whether to answer locally for free or escalate to a paid peer. (`qvac/src/inference/ConfidenceRouter.js`)
- **Spend Policy** — Per-call cap, session budget, daily and monthly budget enforcement. If declined, the buyer keeps the free local draft. (`qvac/src/inference/SpendPolicy.js`)
- **Escrow Channel** — On-chain deposit + off-chain EIP-712 voucher settlement. One deposit opens a channel, then each inference settles off-chain with signed vouchers. (`qvac/src/inference/EscrowChannel.js`)
- **Memory Manager** — Cognitive memory system with importance ranking, consolidation (merge related memories), expiration (TTL decay), and memory type taxonomy (semantic/episodic/procedural). (`qvac/src/inference/MemoryManager.js`)
- **Hybrid Retriever** — Multi-method RAG retrieval: BM25 lexical + embedding vector search with reciprocal rank fusion, optional LLM re-ranking, fuzzy search, and regex search. (`qvac/src/inference/HybridRetriever.js`)
- **Enrichment Queue** — Two-phase save pipeline: instant heuristic classification + background FIFO queue for LLM enrichment (classify, embed, tag, caption). Graceful degradation to heuristics on failure. (`qvac/src/inference/EnrichmentQueue.js`)
- **Link Metadata Cache** — Fetches and caches oEmbed/OpenGraph metadata (title, description, thumbnail) for URLs. Local thumbnail caching with TTL-based invalidation. (`qvac/src/inference/LinkMetadataCache.js`)
- **Vision Captioner** — Generates text captions for images using vision models (Qwen3-VL). Model loads on demand and unloads when idle. Makes screenshots searchable in RAG. (`qvac/src/inference/VisionCaptioner.js`)
- **Evidence Exporter** — Structured audit evidence for compliance: privacy scan, network boundary, RAG quality, API audit, benchmark scope, runtime contract, guardrails, vault snapshot, reviewer questions. (`qvac/src/inference/EvidenceExporter.js`)
- **MCP Client** — Model Context Protocol JSON-RPC client for tool calling. Connects to MCP servers via stdio or HTTP, discovers tools, and invokes them. (`qvac/src/inference/MCPClient.js`)
- **Auto Linker** — Auto-connects related notes/documents via vector similarity. Builds bidirectional link graph, finds clusters, and integrates with KnowledgeGraph. (`qvac/src/inference/AutoLinker.js`)
- **Capability Prober** — Auto-detects hardware (GPU/Metal/CPU, RAM, VRAM), benchmarks each model tier (0.6B → 7B), measures TTFT + TPS, and determines the sellable offer tier. Writes `bench-profile.json`. (`qvac/src/inference/CapabilityProber.js`)
- **Marketplace Broadcaster** — P2P offer advertising and discovery on Hyperswarm DHT. Sellers broadcast offers (model + price + TPS), buyers discover sellers, request quotes, and accept quotes. (`qvac/src/inference/MarketplaceBroadcaster.js`)
- **Memory Extractor** — LLM-based extraction of structured entities, relationships, and facts from raw text. Deduplicates against KnowledgeGraph, stores as graph triplets and semantic memories. (`qvac/src/inference/MemoryExtractor.js`)

## Project Structure

```
localchimera/
├── website/                  # Marketing site + demo wiki + earnings
├── website-new/              # Next-generation marketing site
├── apps/                     # Desktop/mobile apps
│   ├── desktop/              # Tauri desktop app (Linux, macOS, Windows)
│   ├── macos/                # Native macOS app
│   ├── mobile/               # Capacitor mobile app
│   └── mobile-expo/          # Expo mobile variant
├── qvac/                     # Backend node + LLM Wiki frontend
│   ├── src/                  # Node.js backend
│   │   ├── core/             # NodeManager, WalletManager, AuditLogger, ContentAddress, DeploymentLifecycle
│   │   ├── inference/        # QVACInferenceLayer, ProofOfInference, InferenceQueue, PromptGuard, etc.
│   │   ├── llmwiki/          # Upstream bridges (OtterWiki, OpenViking, LLMwiki)
│   │   ├── miners/           # Casper, BTT AI, Golem, Anyone, Mysterium, BTFS
│   │   ├── p2p/              # Pear P2P networking + CapabilityManifest
│   │   ├── web/              # HTTP server + API routes
│   │   └── scheduler/        # TaskMonitor
│   ├── frontend/             # React app (LLM Wiki)
│   ├── Dockerfile            # Hardened container
│   └── docker-compose.yml    # One-command deploy
├── sdk/                      # @localchimera/sdk — build your own app
│   ├── src/                  # Provider implementations
│   └── examples/             # Integration examples
├── inference-backend/        # Encrypted inference backend (FHE/SEAL experiments)
├── inference-config/         # Network deployment configs
├── contracts/                # EVM smart contracts
├── contracts-casper/         # Casper Network smart contracts
├── providers/                # Provider setup/lifecycle scripts
├── scripts/                  # Automation, deployment, and utility scripts
├── docs/                     # Documentation (UPSTREAM.md, RELAY_COMPATIBILITY.md, etc.)
├── cashu/                    # Cashu ecash integration
├── brand-assets/             # Logos and brand assets
├── releases/                 # Release notes and artifacts
├── upstream/                 # Git submodules for upstream forks and dependencies
├── workers/                  # Background workers and cron jobs
│   └── resource-provisioner/ # Request Network → CoW → Golem/BTFS/Mysterium/Anyone/BTT/Casper
├── lib/                      # Foundry libraries (fhevm, forge-std, etc.)
└── README.md
```

## Upstream Projects

Chimera builds on several open-source projects. See [docs/UPSTREAM.md](docs/UPSTREAM.md) for:
- Full catalog of upstream dependencies (Chimera SDK, Pear, Tauri, Capacitor, LLMwiki, Openviking, OtterWiki)
- How to check for and apply updates
- Version tracking matrix

Quick check:
```bash
./scripts/update-upstream.sh check
```

## Production Architecture

The decentralized application platform is built on the tasking networks and supporting infrastructure:

- **Golem** — compute, deployments, rentals, and AI inference.
- **BTFS** — decentralized file storage.
- **Mysterium** — ingress tunnels to Golem activities.
- **Edge Network** — CDN for static assets and media; `@edge/link` for control-plane messaging.
- **Streamr** — real-time telemetry, scaling events, and deployment state events.
- **Namesilo** — domain registration and DNS for user-owned domains.
- **Casper** — on-chain escrow, payments, and identity.
- **Request Network + CoW Protocol** — payment requests and token conversion.

See `docs/PRODUCTION_TASKING_ARCHITECTURE.md` for the full design and deployment instructions.

## New API Endpoints

### Proof of Inference
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/proof/status` | PoI chain status (receipt count, public key) |
| `POST` | `/api/proof/verify` | Verify a receipt independently |

### Prompt Guard
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/prompt-guard/status` | PromptGuard stats (injection count, enabled) |
| `POST` | `/api/prompt-guard/check` | Check text for injection patterns |

### Token Meter
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/meter/status` | Metering status (total metered, settled) |
| `GET` | `/api/meter/sessions` | List all metering sessions + settlements |
| `POST` | `/api/meter/settle` | Record a USDT settlement (txHash, amount) |

### Voice Pipeline
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/voice/transcribe` | Process audio file (transcribe → summarize → embed) |
| `GET` | `/api/voice/status` | VoicePipeline status |

### Agent Loop
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/agent/query` | Run agent query with tool-calling |
| `GET` | `/api/agent/tools` | List available agent tools |

### Document Chunker
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/chunk` | Chunk documents into semantic pieces with IDs |

### Content Address
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/content/status` | ContentAddress stats |
| `POST` | `/api/content/register` | Register data, get content hash |
| `POST` | `/api/content/verify` | Verify data against expected hash |

### Capability Manifest
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/capability/status` | Manifest status (peer count, providers) |
| `POST` | `/api/capability/create` | Create and sign our capability manifest |
| `GET` | `/api/capability/peers` | List peer manifests |

### Deployment Lifecycle
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/deployment/create` | Create a new deployment |
| `GET` | `/api/deployment/list` | List all deployments |
| `GET` | `/api/deployment/:id` | Get deployment by ID (with ETA) |
| `GET` | `/api/deployment/:id/events` | SSE stream of deployment phase changes |

### Circuit Breaker
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/circuit/status` | Circuit breaker stats (open/closed/half-open counts) |
| `GET` | `/api/circuit/list` | List all circuits with state |
| `POST` | `/api/circuit/reset` | Reset a circuit (by targetId or all) |

### Peer Reputation
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/reputation/status` | Reputation system stats |
| `GET` | `/api/reputation/peers` | List all peer reputation scores |

### Model Hot-Swap
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/model/switch` | Hot-swap to a different model |
| `GET` | `/api/model/current` | Get currently loaded model |

### Memory Compactor
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/memory/status` | Compaction stats (total compactions, cache size) |

### Knowledge Graph
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/kg/status` | Graph stats (entities, relationships, sources) |
| `GET` | `/api/kg/search?q=...` | Fuzzy search entities by name |
| `GET` | `/api/kg/entity?name=...` | Get entity with relationships |
| `GET` | `/api/kg/subgraph?name=...&depth=2` | BFS subgraph from entity |
| `POST` | `/api/kg/ingest` | Ingest entities + edges from a source |

### Crypto Vault
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/vault/status` | Vault stats (encrypted/decrypted counts) |
| `POST` | `/api/vault/encrypt` | Encrypt plaintext for a workspace |
| `POST` | `/api/vault/decrypt` | Decrypt ciphertext from a workspace |

### Receipt Gossip
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/gossip/status` | Gossip stats (gossiped, verified, community-verified) |
| `GET` | `/api/gossip/receipts` | List community-verified receipts |
| `POST` | `/api/gossip/broadcast` | Broadcast a receipt for peer verification |

### Dynamic Pricing
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/pricing/status` | Current price + config |
| `GET` | `/api/pricing/history` | Price adjustment history |

### Model Registry
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/registry/status` | Registry stats (total, loaded, by type) |
| `GET` | `/api/registry/list?type=...` | List models (optionally by type) |
| `POST` | `/api/registry/register` | Register a new model |

### Tool Result Cache
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tool-cache/status` | Cache stats (hits, misses, hit rate) |
| `POST` | `/api/tool-cache/invalidate` | Invalidate cache (by tool or all) |

### Semantic Dedup
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/dedup/status` | Dedup stats (checked, duplicates, skipped) |

### SLA Enforcer
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/sla/status` | SLA stats (timeouts, avg duration, breach rate) |

### Content Pinner
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/pinning/status` | Pinning stats (local, remote, fully pinned) |
| `POST` | `/api/pinning/pin` | Pin content to peers |
| `POST` | `/api/pinning/unpin` | Unpin content from peers |
| `GET` | `/api/pinning/status/:hash` | Check pin status for a content hash |

### Deployment Rollback
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/deployment/rollback` | Rollback a deployment to previous phase |

### Task Decomposer
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/decompose/status` | Decomposer stats |
| `POST` | `/api/decompose/run` | Decompose and execute a complex request |

### Conversation Branching
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/conversation/list` | List all conversations |
| `POST` | `/api/conversation/create` | Create a new conversation |
| `POST` | `/api/conversation/message` | Add a message to active path |
| `POST` | `/api/conversation/branch` | Branch from a specific message |
| `POST` | `/api/conversation/switch` | Switch to a different branch |
| `GET` | `/api/conversation/:id/tree` | Get full conversation tree |
| `GET` | `/api/conversation/:id/history` | Get active path history |
| `DELETE` | `/api/conversation/:id` | Delete a conversation |

### Auto-Tagging
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/tagger/status` | Tagger stats |
| `POST` | `/api/tagger/tag` | Auto-tag a single document |
| `POST` | `/api/tagger/batch` | Auto-tag multiple documents |

### Conversation Export
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/export/formats` | List supported export formats |
| `POST` | `/api/export/conversation` | Export a conversation (json/md/txt/openai/csv) |

### Confidence Router
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/confidence/status` | Router stats (local rate, avg confidence) |
| `POST` | `/api/confidence/route` | Route a prompt: local answer or escalate |

### Spend Policy
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/spend/status` | Budget status (daily, monthly, sessions) |
| `POST` | `/api/spend/session/start` | Start a new spending session |
| `POST` | `/api/spend/session/end` | End a session |
| `GET` | `/api/spend/session?sessionId=` | Get session status |

### Escrow Channel
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/escrow/status` | Escrow stats |
| `POST` | `/api/escrow/open` | Open a channel with deposit |
| `POST` | `/api/escrow/voucher` | Create a signed voucher |
| `POST` | `/api/escrow/settle` | Settle a channel on-chain |
| `POST` | `/api/escrow/close` | Close a channel |
| `GET` | `/api/escrow/list?status=` | List channels |

### Memory Manager
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/memory/status` | Memory stats (by type, consolidation) |
| `POST` | `/api/memory/add` | Add a memory |
| `GET` | `/api/memory/search` | Search memories |
| `POST` | `/api/memory/update` | Update a memory |
| `DELETE` | `/api/memory/delete` | Delete a memory |
| `GET` | `/api/memory/types` | Get memory type taxonomy |

### Hybrid Retriever
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/hybrid/status` | Retriever stats |
| `POST` | `/api/hybrid/search` | Hybrid search (BM25 + embedding + rerank) |

### Enrichment Queue
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/enrichment/status` | Queue stats |
| `POST` | `/api/enrichment/save` | Save item with heuristic + queue enrichment |

### Link Metadata
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/link-meta/status` | Cache stats |
| `POST` | `/api/link-meta/fetch` | Fetch metadata for a URL |

### Vision Captioner
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/vision/status` | Captioner stats |
| `POST` | `/api/vision/caption` | Caption an image |

### Evidence Exporter
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/evidence/types` | List evidence types |
| `POST` | `/api/evidence/export` | Export a specific evidence type |
| `POST` | `/api/evidence/export-all` | Export all evidence types |

### MCP Client
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/mcp/status` | MCP client stats |
| `GET` | `/api/mcp/servers` | List connected servers |
| `GET` | `/api/mcp/tools` | List all discovered tools |
| `POST` | `/api/mcp/connect` | Connect to an MCP server |
| `POST` | `/api/mcp/call` | Call a tool on a server |
| `POST` | `/api/mcp/disconnect` | Disconnect from a server |

### Auto Linker
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/auto-link/status` | Linker stats |
| `POST` | `/api/auto-link/build` | Build links for a workspace |
| `GET` | `/api/auto-link/related?workspace=&docId=` | Get related documents |
| `GET` | `/api/auto-link/graph?workspace=` | Get full link graph |
| `GET` | `/api/auto-link/clusters?workspace=` | Find document clusters |

### Capability Prober
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/probe/status` | Prober stats (backend, sellable, offer) |
| `POST` | `/api/probe/run` | Run a full capability probe |
| `GET` | `/api/probe/profile` | Get the current capability profile |
| `GET` | `/api/probe/offer` | Get the sellable offer (tier, model, TPS) |

### Marketplace Broadcaster
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/market/status` | Marketplace stats (offers, quotes) |
| `POST` | `/api/market/start` | Start broadcasting offers |
| `POST` | `/api/market/stop` | Stop broadcasting |
| `GET` | `/api/market/sellers` | Discover active seller offers |
| `POST` | `/api/market/quote` | Request a quote from a seller |
| `POST` | `/api/market/quote/accept` | Accept a quote |
| `GET` | `/api/market/quote?quoteId=` | Get quote status |
| `GET` | `/api/market/offer` | Get our current offer |

### Memory Extractor
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/extract/status` | Extractor stats |
| `POST` | `/api/extract/run` | Extract entities/relations/facts from text |
| `POST` | `/api/extract/batch` | Extract from multiple texts (merged) |

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (or later).



---

## SDK

<!-- Source: sdk/README.md -->


Integrate local AI mining into your application. Your users earn revenue from idle inference tasks. You earn a percentage as the app integrator.

## How payouts work

All tasking network providers mine directly into the **Chimera protocol multisig** (`0x7eB4A545F875FC1Da252661d31a3e28e67bf723f`) — providers never use individual wallet addresses. EVM only.

1. **Mining** — user's device completes tasks on tasking networks (Golem, Mysterium, Anyone Protocol, BTFS, BTT AI, Casper). All rewards flow to the protocol multisig.
2. **Monthly sweep** — the protocol multisig distributes funds to:
   - **Machine owner** Web3Auth wallet (user's embedded wallet via Web3Auth)
   - **App developer** Web3Auth wallet (your address, set in SDK options)
   - Split based on `revenueSplit` config (default 70/30)

Individual Web3Auth wallets are **never used by providers directly** — they only receive funds via the monthly sweep from the protocol multisig.

## What the SDK gives your app

- **Consent prompt** — users opt in before any mining starts
- **Start / Stop controls** — one-click mining controls
- **Miner status** — real-time view of which miners are active
- **Inference API** — OpenAI-compatible `/v1/chat/completions` endpoint (container mode) or in-browser WebGPU/WASM inference (browser mode)
- **SDK auto-update** — checks for newer versions and notifies your app via `sdkUpdate` in the hook

### Two runtime modes

| Mode | When | How it works | Inference |
|------|------|-------------|-----------|
| **Container mode** | Backend / desktop app with Docker | Providers run inside a hardened Docker container with `CHIMERA_PRIVACY_MODE=true` | vLLM/SGLang via container's OpenAI-compatible API |
| **Browser mode** | Website with no backend | `BrowserNode` runs entirely in-browser — WebGPU inference, IPFS storage, WebRTC bandwidth, WASI compute | WebLLM (WebGPU) or transformers.js (WASM) — no API key needed |

The hook auto-detects which mode to use by checking if the backend API is reachable.

Wallet setup, earnings tracking, and revenue distribution are handled on the **Chimera landing page**, not in your app.

## Install

```bash
npm install @localchimera/sdk
```

Or copy the `sdk/` folder into your project.

## Quick Start

### React — with Web3Auth wallet integration

The SDK ships with `ChimeraWeb3AuthProvider` — a pre-configured Web3Auth provider. It enables social login (Google, email, guest) and auto-generates embedded wallets on login. Wrap your app and call the hook:

```jsx
import { ChimeraWeb3AuthProvider, useChimera } from '@localchimera/sdk';

// App root — ChimeraWeb3AuthProvider handles Web3Auth config automatically
function Root() {
  return (
    <ChimeraWeb3AuthProvider>
      <App />
    </ChimeraWeb3AuthProvider>
  );
}

// Inside App — use the hook
function App() {
  const chimera = useChimera({
    appDeveloperEVM: '0xYourEvmWalletAddressHere',
    revenueSplit: { machineOwner: 0.70, appDeveloper: 0.30 },
  });

  return (
    <div>
      {!chimera.walletConnected && (
        <button onClick={chimera.connectWallet}>Connect Wallet</button>
      )}
      {chimera.walletConnected && !chimera.consentGiven && (
        <button onClick={chimera.giveConsent}>Enable Mining</button>
      )}
      {chimera.consentGiven && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={chimera.start} disabled={chimera.status.running}>Start</button>
          <button onClick={chimera.stop} disabled={!chimera.status.running}>Stop</button>
          <button onClick={chimera.revokeConsent}>Revoke</button>
        </div>
      )}
    </div>
  );
}
```

**Social login:** `connectWallet()` triggers Web3Auth's free PnP modal with Google, email, and guest options. An embedded wallet is auto-created on first login — no browser extension required.

**Protocol keys:** The SDK uses a shared Web3Auth Client ID. You can override it with the `VITE_WEB3AUTH_CLIENT_ID` environment variable.

**Third-party domains:** Web3Auth works on any domain automatically via the configured Client ID.

That's it. Your app does **not** collect wallet addresses, show earnings, or handle revenue splits — the Chimera dashboard handles all of that.

### Backend (optional, for server-side control)

```javascript
import { ChimeraSDK } from '@localchimera/sdk';

const sdk = new ChimeraSDK({
  appName: 'MyApp',
  appDeveloperEVM: '0xYourEvmWalletAddressHere'
});

await sdk.init();
sdk.giveConsent();
await sdk.start();
```

## What your app should NOT do

| ❌ Don't | ✅ Do instead |
|---|---|
| Ask users for wallet addresses | Show only consent + start/stop |
| Display earnings or revenue splits | Link users to the Chimera dashboard |
| Configure per-chain addresses | Pass only `appDeveloperEVM` — EVM only |
| Handle fund sweeping or distribution | Let the protocol handle it |

## `useChimera` options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appDeveloperEVM` | string | `null` | Your EVM payout address |
| `revenueSplit` | object | `{ machineOwner: 0.70, appDeveloper: 0.30 }` | Override split (protocol-level) |

## Task dispatch policy

`useChimera().sendTask(task)` creates an on-chain job through the `ChimeraCoordinator` contract and lets you choose who can execute it:

| Policy | Constant | Default | Escrow / dispute | Fallback |
|--------|----------|---------|------------------|----------|
| Hybrid | `TASK_POLICY.HYBRID` | Yes | Chimera volunteers first; tasking networks if no volunteer | Enabled |
| First-party only | `TASK_POLICY.FIRST_PARTY_ONLY` | No | Full escrow and dispute features | Disabled — no tasking network fallback |
| Second-party only | `TASK_POLICY.SECOND_PARTY_ONLY` | No | Not available | Directly routed to tasking networks |

```jsx
import { useChimera, TASK_POLICY, TASK_TYPE_BOTCHAIN } from '@localchimera/sdk';

const chimera = useChimera();

const result = await chimera.sendTask({
  taskType: TASK_TYPE_BOTCHAIN.INFERENCE, // 4
  escrow: '0.1', // BOT
  policy: TASK_POLICY.HYBRID, // default
  payload: { messages: [{ role: 'user', content: 'Hello' }] },
});
```

Set the coordinator address with the `VITE_CHIMERA_COORDINATOR_ADDRESS` environment variable or the `coordinator` option.

### On-chain fallback via Li.Fi

For **hybrid** and **second-party-only** tasks, the coordinator can execute the fallback bridge on-chain through `ChimeraBridgeDispatcher`:

- Second-party-only tasks are bridged automatically during `sendTask`.
- Hybrid tasks hold the full amount in the coordinator. If no volunteer completes within `fallbackTimeout`, the held amount is bridged to the tasking network by the automated fallback keeper.
- Set the bridge dispatcher with `VITE_CHIMERA_BRIDGE_DISPATCHER_ADDRESS` and configure the bridge route per task type via `coordinator.setBridgeData()`.
- Configure the refund bridge via `coordinator.setRefundBridgeData()` so that unfulfilled tasking-network jobs can be refunded to the origin chain. The default `refundTimeout` is 1 hour.
- Automation is handled by **Reactive Network**: a `ChimeraReactive` contract on Reactive Network periodically calls `coordinator.processExpiredJobs()` on the origin chain. This triggers both fallback for unpaid hybrid jobs and refunds for bridged jobs that exceed `refundTimeout` without `markFallbackComplete()` being called. The coordinator also exposes `checkUpkeep`/`performUpkeep` for Chainlink Automation or Gelato as a fallback.

### External miners

The SDK can run external DePIN miners as volunteer providers (`sdk/src/miners/index.js`). All reward-bearing providers default to the protocol payout address (`CHIMERA_PROTOCOL_PAYOUT_ADDRESS`, default `0x7eB4A545F875FC1Da252661d31a3e28e67bf723f`) and never ask for or store a private key:

- `BttAiMinerProvider` — BTT AI Labs inference miner (payout address in status)
- `GolemProvider` — Golem compute provider (yagna wallet managed separately; earnings should be swept to the protocol address)
- `MysteriumProvider` — Mysterium bandwidth provider (`MYSTERIUM_PAYOUT_ADDRESS` env)
- `BtfsStorageProvider` — BTFS storage provider (walletless by design; no on-chain private key in the SDK)
- `StorjProvider` — Storj storage node provider (`--operator.wallet` set to the protocol address)
- `AnyoneProtocolProvider` — Anyone Protocol onion-routing relay provider (`--reward-address` set to the protocol address)
- `CasperProvider` — Casper node provider (relay-only; rejects any PEM private key)

Run them via the SDK's miner runner or import the provider classes directly. The fallback router can also use the optional providers. GPU tasks are routed to Akash because Golem is CPU-only:

- Inference: BTT AI (default) or Akash (`INFERENCE_PROVIDER=akash`); GPU tasks default to Akash (`requiresGpu` / `FALLBACK_REQUIRES_GPU`)
- Storage: Storj (default) or BTFS (`STORAGE_PROVIDER=btfs`)
- Compute: Golem (default, CPU-only) or Akash (`COMPUTE_PROVIDER=akash`); GPU tasks default to Akash (`requiresGpu` / `FALLBACK_REQUIRES_GPU`)
- Bandwidth: Mysterium (default) or Anyone Protocol (`BANDWIDTH_PROVIDER=anyone`)

## `ChimeraSDK` options (backend)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `appName` | string | `'unknown-app'` | Identifier for logs |
| `appDeveloperEVM` | string | `null` | Your EVM payout address |
| `machineOwnerEVM` | string | `null` | User's EVM payout address |
| `configPath` | string | `./config.json` | Path to provider config |
| `containerImage` | string | `'chimera:latest'` | Docker image for the hardened privacy container |
| `containerPort` | number | `3002` | Host port to expose the container API |

## Hardened Privacy Container (Required)

The SDK runs **exclusively** inside a hardened privacy container. Docker is required — there is no inline mode. The container ensures the host machine identity is never visible:

- **Random hostname and MAC address** — network identity changes on every start
- **Bridge networking only** — no host network mode
- **All capabilities dropped** (`--cap-drop ALL`) and `no-new-privileges`
- **Named Docker volumes** — no host bind mounts that could leak paths
- **Config mounted read-only** — the container cannot modify its own config
- **`CHIMERA_PRIVACY_MODE=true`** — all providers run inline as processes (no Docker-in-Docker):
  - Anonymous node ID in logs and status
  - No orchestrator registration (no host IP/hostname exposed)
  - No device profiling (no CPU/RAM specs sent to external contracts)
  - Masks EVM addresses in log output
  - Disables P2P swarm

`init()` throws if Docker is not available. The `PrivacyContainer` class is exported for advanced use cases.

## Provider Testing

Test all providers after init:

```javascript
const results = await sdk.testProviders();
// { tested: 7, active: 5, results: [{ provider: 'golem', running: true, latency: 12 }, ...] }
```

## Inference API Keys

The hardened container exposes an **OpenAI-compatible** inference endpoint at `/v1/chat/completions`. You can create API keys that let other apps or users call inference without exposing the machine's identity.

### Creating a key

```javascript
const { key, id, keyPrefix } = await sdk.createInferenceKey({
  name: 'my-app-key',
  rateLimitRpm: 60,             // optional: 60 requests per minute
  modelAllowList: ['chimera-local'], // optional: restrict to specific models
});
// key = 'chim_<random-token>' — share this with the consumer app
// The key contains NO machine identity, NO personal info, NO embedded metadata
```

### Using the key for inference

The key works as a standard Bearer token with any OpenAI-compatible client:

```javascript
const res = await fetch('http://localhost:3002/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${key}`,
  },
  body: JSON.stringify({
    model: 'chimera-local',
    messages: [{ role: 'user', content: 'Hello!' }],
  }),
});
const data = await res.json();
```

Or using the SDK directly:

```javascript
const result = await sdk.infer({
  messages: [{ role: 'user', content: 'Hello!' }],
  apiKey: key,
});
```

### Managing keys

```javascript
await sdk.listInferenceKeys();      // list active keys (metadata only)
await sdk.revokeInferenceKey(id);   // revoke a key by ID
sdk.getInferenceEndpoint();         // get endpoint URL + usage info
```

### Paid inference access

Purchase temporary credits without sharing API keys:

```javascript
const access = await sdk.purchaseInferenceAccess({
  amountUSDT: 5.00,
  ttlSeconds: 3600,
  buyerAddress: '0x...',
});
// { token: 'chim_access_...', sessionId, credit, pricePerToken, expiresAt }

await sdk.getAccessPricing();              // current pricing
await sdk.getAccessStatus(sessionId);      // check session status
await sdk.revokeAccessSession(sessionId);  // revoke early
```

### Privacy guarantees

- API keys are **opaque random tokens** (`chim_` + 32 bytes) — no machine ID, hostname, IP, or user info embedded
- Keys are stored as **SHA-256 hashes** — the raw key is only returned once at creation time
- The inference endpoint returns only model output — **no host info, no device profile, no node ID**
- All requests are proxied through the hardened container — the host machine is never directly exposed

## Architecture

```
┌─────────────────┐
│  Your App       │  ← consent checkbox + start/stop buttons
│  (React, etc.)  │
└────────┬────────┘
         │ useChimera()
┌────────▼────────┐
│  Chimera SDK    │  ← manages consent, forwards EVM address
│  (@localchimera/sdk) │    requires hardened container (Docker)
└────────┬────────┘
         │
┌────────▼────────┐
│  Privacy        │  ← Docker container: random hostname/MAC,
│  Container      │    bridge network, cap-drop ALL, no-new-privileges,
│  (Docker)       │    named volumes, CHIMERA_PRIVACY_MODE=true
└────────┬────────┘
         │
┌────────▼────────┐
│  Tasking        │  ← Golem, Mysterium, Anyone Protocol, BTFS, BTT AI,
│  Providers      │    Casper (relay) — all inline, no Docker-in-Docker
└────────┬────────┘
         │
┌────────▼────────┐
│  Protocol       │  ← monthly sweep → machine owner + app developer
│  Multisig       │    Web3Auth wallets (EVM only)
└─────────────────┘
```

## Security: Private Key Handling

**The SDK never stores or exposes private keys.**

| Provider | Untrusted Hardware | Key Storage | SDK Access | App Can Steal? |
|----------|-------------------|-------------|------------|----------------|
| **Golem** | ✅ Safe | Yagna daemon manages keys inside container | Container API only | ❌ No |
| **Mysterium** | ✅ Safe | Node manages identity inside container | Container API only | ❌ No |
| **Anyone Protocol** | ✅ Safe | No keys required — relay uses EVM reward address | Container API only | ❌ No |
| **BTFS** | ✅ Safe | Walletless mode — unfunded daemon, no mnemonic | Container API only | ❌ No |
| **BTT AI** | ✅ Safe | No keys required — miner-cli runs inline | Container API only | ❌ No |
| **Casper** | ✅ Safe (relay mode) | Provider key lives on relay; worker never sees PEM | Relay URL + token only | ❌ No |

**Apps using the SDK cannot extract funds** because they never receive the actual key material — only references to OS-level secure storage.

**Removed from the codebase** — providers that require a private key, wallet mnemonic, account credentials, or self-managed config on the local machine are not included in Localchimera because they cannot safely run on untrusted hardware and their upstream protocols do not support a relay/worker split. The old list (BTT AI, Golem, Mysterium, Anyone Protocol, BTFS, CESS, Akash, Targon, ZCN, Income Generator, CashPilot, Salad, Heurist, Lium, Nosana, ByteLeap) and the per-network analysis is archived in `docs/RELAY_COMPATIBILITY.md` for reference.

## Full example

See `examples/basic-react/` for a complete working integration.

## License

MIT


---

## PROVIDERS

<!-- Source: providers/README.md -->


Setup and lifecycle scripts for untrusted-hardware-safe mining/tasking providers.

## Files

- `start-all.sh` — launcher that prints startup instructions for all kept providers
- `status.sh` — quick status dashboard for running Docker containers and QVAC miners
- `setup-btfs.sh` — walletless BTFS storage node setup (no BTT wallet on device)
- `setup-zcn-blobber.sh` — 0Chain blobber setup (archived / kept for reference only)

## Supported Networks

All providers listed here are safe to run on untrusted hardware:

- BTT AI (GPU inference, proxy mode)
- Golem (decentralized compute, Docker)
- Anyone Protocol (onion relay, Docker)
- Mysterium (VPN node, Docker)
- BTFS (walletless storage)
- Casper (relay-mode escrow bridge)

## Usage

```bash
./providers/start-all.sh
./providers/status.sh
```

For individual setup, see the `setup-*.sh` scripts.


---

## QVAC

<!-- Source: qvac/README.md -->


A distributed node that combines QVAC inference with multiple mining capabilities, distributed via Pear P2P.

## Quick Start with Docker

The easiest way to run the QVAC-Pear Miner Node is using Docker:

```bash
# Build the Docker image
docker build -t qvac-pear-miner:latest .

# Run the container
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data qvac-pear-miner:latest

# Or use Docker Compose
docker-compose up -d
```

The node will be available at `http://localhost:3000`

## Push dispatch (volunteer coordinator)

The QVAC miner can connect to the Localchimera volunteer coordinator instead of (or in addition to) polling the blockchain for jobs. The coordinator pushes matching jobs to the node via WebSocket; the node executes them and returns the result, and the protocol orchestrator submits the on-chain result.

Set the environment variables before starting:

```bash
export COORDINATOR_URL=wss://coordinator.localchimera.com
export COORDINATOR_TOKEN=your-coordinator-token
```

The Casper and Botchain escrow bridges in `src/miners/` will automatically connect to the coordinator when started. If no coordinator is configured, the bridges continue to poll the blockchain.

## On-chain Botchain coordinator + bridge dispatcher

When `BOTCHAIN_COORDINATOR_ADDRESS` is set, the Botchain bridge listens for `JobRouted` events and processes jobs assigned to its wallet. If a job is not completed in time, the on-chain coordinator can trigger a fallback. When `BOTCHAIN_BRIDGE_DISPATCHER_ADDRESS` is also configured, the coordinator bridges funds to the tasking network via Li.Fi on-chain and emits a `FallbackBridged` event. The QVAC bridge can then optionally execute the tasking network job and submit the result on-chain.

## One-Line Integration

The embed script auto-detects idle compute and connects to mining networks. No AI model specification required for regular apps — only mining nodes need explicit model config.

```html
<script 
  src="https://cdn.qvac-pear.io/inference-embed.js"
  data-app-id="your-app-id"
  auto-install>
</script>
```

**Important:** The user's ID needs to be affiliated with an EVM address that confirms the use of their machine's inference resources. The embed script will automatically request wallet connection if `auto-install` is enabled.

## Protocol Multisig Fund Management

The protocol maintains a **shared multisig** for Bittensor. All applications use the same protocol address — no per-app generation required.

- **Bittensor** — Substrate protocol multisig (2-of-3)
- **EVM** — Direct deposit to machine owner address

### Two-Sweep Architecture

**Step 1 — Weekly Collection** (`scripts/weekly-fund-sweep.js`)
- Collects funds from all network protocol multisigs (Bittensor, Arbitrum) into the EVM collection multisig
- Runs every Sunday with 48-hour denial window

**Step 2 — Monthly Distribution** (`scripts/monthly-fund-sweep.js`)
- Distributes from EVM collection multisig to machine owner and app developer
- Runs on the 1st of each month with 48-hour denial window
- Split: **70%** machine owner, **30%** app developer

To deny a sweep:
```bash
# Weekly collection
node scripts/weekly-fund-sweep.js --deny weekly-collect-nostr-1234567890

# Monthly distribution
node scripts/monthly-fund-sweep.js --deny monthly-dist-1234567890
```

### Docker Compose (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Alternative: Native npm (All Desktop Platforms)

For machines without Docker, or for development:

```bash
# Install dependencies
npm install

# Start the node
MACHINE_OWNER_EVM=0x... APP_ID=your-app-id npm start
```

### Quick Start (Desktop)

The simplest way to install on desktop — fully containerized and isolated:

1. Visit the dashboard and enter your EVM payout address
2. Click **"Download Installer"** — the website auto-detects your OS and downloads **two files**:
   - **Windows**: `start-node.bat` + `stop-node.bat`
   - **macOS**: `start-node.sh` + `stop-node.sh`
   - **Linux**: `start-node.sh` + `stop-node.sh`
3. Double-click `start-node` — it checks for Docker, downloads the repo, builds a container, and starts the node
4. The node keeps running and earning until you double-click `stop-node` to shut it down
5. Everything runs in an isolated Docker container — it cannot affect your machine

No terminal commands to memorize. No zip extraction. Fully containerized. Start to earn, stop when done.

### Phone / Mobile (PWA)

Open `https://new.localchimera.com/mobile` on your phone. Tap **"Add to Home Screen"** — it installs as a PWA and works offline. No APK, no app store, no download.

For embedding in another app:
```html
<script
  src="https://cdn.qvac-pear.io/inference-embed.js"
  data-app-id="your-app-id"
  data-evm-address="0x..."
  auto-install>
</script>
```

## Architecture

This node integrates:
- **QVAC** - Base inference layer for AI applications
- **Pear** - Peer-to-peer app distribution
- **Hypercore** - Distributed data store
- **Multi-Miner Support** - BTT AI, Golem, Anyone Protocol, Mysterium, Casper, Botchain
- **Centralized Inference** - All miners route through single QVAC inference node

## Features

- **Dual Mode Operation**: Serves AI inference when active, switches to mining when idle
- **P2P Distribution**: Apps distributed via Pear runtime without cloud infrastructure
- **Zero-Auth Installation**: Simple sign-in with consent flow, no complex authentication
- **Distributed Storage**: Hypercore for secure, distributed data storage
- **Multi-Miner Support**: Automatically switches between on-chain and resource-provider mining protocols
- **Centralized Inference**: All miners route through single QVAC inference node
- **Container Ready**: Full Docker support for easy deployment

## Installation

### Docker Installation (Recommended)

```bash
# Clone the repository
git clone https://github.com/your-org/qvac-chimera.git
cd qvac-chimera

# Build and run with Docker Compose
docker-compose up -d

# Or build manually
docker build -t qvac-pear-miner:latest .
docker run -d -p 3000:3000 -v $(pwd)/data:/app/data qvac-pear-miner:latest
```

### Manual Installation

```bash
# Install dependencies
npm install

# Initialize the node
npm run init

# Start the node
npm start
```

## Usage

The node automatically:
1. Connects to the P2P network via Pear
2. Initializes QVAC inference layer
3. Sets up Hypercore data store
4. Monitors for inference requests
5. Switches to mining when idle

## Configuration

Edit `config.json` to customize:
- Miner priorities
- Inference settings
- P2P network settings
- Data storage paths

## Development

```bash
# Install development dependencies
npm install --save-dev

# Run tests
npm test

# Build for production
npm run build
```

## License

MIT


---

## SRC

<!-- Source: qvac/src/README.md -->


Node.js source for the QVAC backend node.

## Subdirectories

- `api/` — HTTP API route handlers
- `auth/` — Authentication and session management
- `casper/` — Casper Network relay integration
- `cli/` — Command-line tools and entry points
- `core/` — NodeManager, WalletManager, AuditLogger, ContentAddress, DeploymentLifecycle
- `inference/` — QVAC inference engine, prompt guard, token metering, voice pipeline, agent loop
- `llmwiki/` — Upstream bridges: OtterWiki, OpenViking, LLMwiki
- `miners/` — Tasking network miners (BTT AI, Golem, Anyone, Mysterium, BTFS, Casper, Botchain)
- `orchestrator/` — Fleet commander/worker orchestration
- `p2p/` — Pear P2P networking, capability manifests, content pinning
- `payout/` — Protocol payout and sweep logic
- `scheduler/` — Task monitor and scheduling
- `storage/` — Hypercore store, encrypted vault, local persistence
- `web/` — HTTP server setup and file conversion endpoints

## Entry Points

- `index.js` — Main QVAC node entry
- `init.js` — Initialization helpers


---

## APPS

<!-- Source: apps/README.md -->


OS-specific applications that wrap the Chimera LLM Wiki and backend.

## desktop/

Tauri-based desktop app for Linux, macOS, and Windows. Bundles the React frontend inside a native Rust shell with a Go supervisor sidecar for node lifecycle management.

- **src/** — React frontend (copied from qvac/frontend/dist at build time)
- **src-tauri/** — Rust Tauri shell, Cargo.toml, tauri.conf.json
- **src-tauri/icons/** — App icons for all platforms (PNG, ICO, ICNS)
- **supervisor/** — Go binary that manages Docker container start/stop
- **dist/** — Build output copied from qvac/frontend

Build:
```bash
cd apps/desktop
npm install
npm run tauri:build
# Output: src-tauri/target/release/bundle/
```

## install/

One-click install scripts for setting up Chimera on each platform.

- **install-linux.sh** — Installs Docker, pulls image, starts node
- **install-macos.sh** — macOS setup with Homebrew dependencies
- **install.sh** — Universal installer that detects OS

## macos/

Native macOS app bundle (.app) and DMG installer. Built from the same Tauri source as desktop/.

## mobile/

Capacitor-wrapped mobile apps for iOS and Android. Each phone is a standalone node — no relay, no desktop dependency.

- **ios/** — Xcode project for App Store
- **android/** — Android Studio project for Play Store

Build:
```bash
cd qvac/frontend
npm install && npm run build
npx cap sync
npx cap open ios     # Xcode → Archive → App Store
npx cap open android # Android Studio → Generate Signed Bundle
```

## mobile-expo/

Expo-based mobile app using a Bare worker for on-device inference. See `mobile-expo/README.md` for build instructions.


---

## DOCS

<!-- Source: docs/UPSTREAM.md -->


This repo integrates and extends several open-source projects. This document tracks where each comes from, how it is consumed, and how to update it.

## Core Infrastructure

| Project | Upstream Repo | How We Consume | Current Version | Last Checked |
|---|---|---|---|---|
| **QVAC SDK** | `npm:@qvac/sdk` | npm dependency | `^0.13.2` | 2026-06-18 |
| **Pear Runtime** | `npm:pear-runtime` | npm dependency | `^1.0.0` | 2026-06-18 |
| **Hyperswarm** | `npm:hyperswarm` | npm dependency | `^4.0.0` | 2026-06-18 |
| **Hypercore** | `npm:hypercore` | npm dependency | `^10.0.0` | 2026-06-18 |
| **Tauri** | `github:tauri-apps/tauri` | npm + GitHub Actions | `^2.0.0` | 2026-06-18 |
| **Capacitor** | `github:ionic-team/capacitor` | npm + mobile projects | `^7.0.0` | 2026-06-18 |

## Mining Networks

Only tasking networks that are **safe on untrusted hardware** are integrated. They are consumed as **forked Git submodules** under `upstream/`. This keeps their larger contributor bases driving the code while giving Localchimera a stable, reviewable integration point. To fork them into your own GitHub org and repoint `.gitmodules`, run:

```bash
./scripts/fork-upstream.sh <your-github-username-or-org>
```

| Project | Upstream Repo | Submodule Path | How We Consume | Included in SDK? | Notes |
|---|---|---|---|---|---|
| **BTT AI** | `github.com/BTT-AI-labs/miner-cli` | `upstream/btt-ai-miner` | Docker / GPU miner (`sdk/src/miners/BttAiMinerProvider.js`) | ✅ | Proxy mode, no local wallet |
| **Golem** | `github.com/golemfactory/yagna` | `upstream/golem` | Docker provider (`sdk/src/miners/GolemProvider.js`) | ✅ | Payout address only |
| **Anyone Protocol** | `github.com/anyone-protocol/ator-protocol` | `upstream/anyone-protocol` | Docker relay (`sdk/src/miners/AnyoneProtocolProvider.js`) | ✅ | No keys required |
| **Mysterium** | `github.com/mysteriumnetwork/node` | `upstream/mysterium` | Docker VPN node (`sdk/src/miners/MysteriumProvider.js`) | ✅ | No keys required |
| **BTFS** | `github.com/bittorrent/go-btfs` | `upstream/btfs` | Walletless storage network (`sdk/src/miners/BtfsStorageProvider.js`) | ✅ | No BTT wallet on device; storage-host mode disabled; payments on Casper |

Networks that require a private key, wallet mnemonic, account credentials, or self-managed config on the local machine have been removed from the codebase entirely because they cannot safely run on untrusted hardware and their upstream protocols do not support a relay/worker split. The old analysis is archived in `docs/RELAY_COMPATIBILITY.md` for reference.

## Wiki / Knowledge Base

| Project | Upstream Repo | How We Consume | Our Code | Update Method |
|---|---|---|---|---|
| **LLMwiki** | `github.com/lucasastorian/llmwiki` | **Git submodule** — vendored in `upstream/llmwiki/` | `qvac/src/llmwiki/bridge.py` | `git submodule update --remote upstream/llmwiki` |
| **Openviking** | `github.com/volcengine/OpenViking` | **Git submodule** — vendored in `upstream/openviking/` | `qvac/src/llmwiki/openviking_bridge.py` (HTTP client) | `git submodule update --remote upstream/openviking` |
| **OtterWiki** | `github.com/redimp/otterwiki` | **Git submodule** — vendored in `upstream/otterwiki/` | `qvac/src/llmwiki/otterwiki_bridge.py` (GitStorage wrapper) | `git submodule update --remote upstream/otterwiki` |
| **Knowledge Catalog / OKF** | `github.com/GoogleCloudPlatform/knowledge-catalog` | **Git submodule** — vendored in `upstream/knowledge-catalog/` | `docs/UPSTREAM.md` (OKF spec) | `git submodule update --remote upstream/knowledge-catalog` |

## Tools / File Conversion

| Project | Upstream Repo | How We Consume | Our Code | Update Method |
|---|---|---|---|---|
| **repo-to-markdown** | `github.com/puter-apps/repo-to-markdown` | **Git submodule** — vendored in `upstream/repo-to-markdown/` | `qvac/src/web/repoToMarkdownAdapter.js` + `repoDigest.js` | `git submodule update --remote upstream/repo-to-markdown` |
| **markitdown** | `github.com/microsoft/markitdown` | **Git submodule** — installed via `requirements.txt` (`-e ../upstream/markitdown/packages/markitdown`) | `qvac/src/web/server.js` (`handleConvertToMd`) | `git submodule update --remote upstream/markitdown` |

## Fully Homomorphic Encryption (FHE)

| Project | Upstream Repo | Submodule Path | How We Consume | Notes |
|---|---|---|---|---|
| **Zama Concrete** | `github.com/zama-ai/concrete` | `upstream/concrete` | Reference design and upstream API model | Rust FHE compiler; tracked for API patterns and future migration |
| **Zama fhEVM** | `github.com/zama-ai/fhevm` | `upstream/fhevm` | On-chain encrypted state / contract integration | Solidity FHE runtime for EVM; tracked for encrypted on-chain inference jobs and results |

The FHE runtime shipped in this repo uses **Microsoft SEAL** (`node-seal`) because it provides a portable WebAssembly build that works in both the browser (tasker) and Node.js (provider). The Concrete and fhEVM submodules are maintained as upstream references: Concrete for the FHE API model and fhEVM for migrating the on-chain job/result state to encrypted EVM contracts.

## Git Submodules (Upstream Code We Use Directly)

We vendor upstream repos as git submodules so their code is always available and we can import from them directly. This avoids maintaining parallel implementations.

### Initial clone with submodules

```bash
git clone --recurse-submodules https://github.com/TerexitariusStomp/localchimera.git
```

### Update all submodules to latest upstream

```bash
git submodule update --remote --merge
# Commit the updated submodule refs
git add upstream/ && git commit -m "chore: bump upstream submodules"
```

### Individual submodule updates

```bash
git submodule update --remote upstream/markitdown
git submodule update --remote upstream/llmwiki
git submodule update --remote upstream/repo-to-markdown
git submodule update --remote upstream/openviking
git submodule update --remote upstream/otterwiki
git submodule update --remote upstream/knowledge-catalog
```

### Current submodules

| Submodule | Path | Installed Via |
|---|---|---|
| `microsoft/markitdown` | `upstream/markitdown/` | `pip install -e upstream/markitdown/packages/markitdown` |
| `lucasastorian/llmwiki` | `upstream/llmwiki/` | Referenced directly; thin wrapper in `qvac/src/llmwiki/` |
| `puter-apps/repo-to-markdown` | `upstream/repo-to-markdown/` | Referenced directly; custom adapter in `qvac/src/web/repoDigest.js` |
| `volcengine/OpenViking` | `upstream/openviking/` | `qvac/src/llmwiki/openviking_bridge.py` — memory storage via HTTP client |
| `redimp/otterwiki` | `upstream/otterwiki/` | `qvac/src/llmwiki/otterwiki_bridge.py` — git-backed wiki storage |
| `GoogleCloudPlatform/knowledge-catalog` | `upstream/knowledge-catalog/` | Reference OKF spec at `upstream/knowledge-catalog/okf/SPEC.md` |
| `zama-ai/concrete` | `upstream/concrete/` | Reference design and upstream API model for FHE layer |
| `zama-ai/fhevm` | `upstream/fhevm/` | Solidity FHE runtime for encrypted on-chain inference jobs and results |
| `bittorrent/go-btfs` | `upstream/btfs/` | Walletless storage daemon used by `sdk/src/miners/BtfsStorageProvider.js` |
| **Tasking network forks** | `upstream/*` | Docker or binary builds; protocol wrappers in `qvac/src/miners/` and `sdk/src/miners/` |

Tasking-network submodules are listed in `.gitmodules` and forked into the Localchimera GitHub org via `scripts/fork-upstream.sh`. After forking, update them with:

```bash
# Update all forked tasking submodules to the latest upstream commits
git submodule update --remote --merge \
  upstream/btt-ai-miner \
  upstream/golem \
  upstream/anyone-protocol \
  upstream/mysterium \
  upstream/btfs
# Commit the updated submodule refs
git add upstream/ && git commit -m "chore: bump tasking network forks"
```

## Updating npm Dependencies

```bash
# Check all packages for outdated dependencies
./scripts/update-upstream.sh check

# Update all packages to latest compatible versions
./scripts/update-upstream.sh update

# Update lockfiles after manual edits
./scripts/update-upstream.sh install
```

## Updating QVAC SDK

The QVAC SDK (`@qvac/sdk`) powers all inference. To update:

```bash
cd qvac
npm update @qvac/sdk
# Test inference layer
cd ../sdk
npm test
```

Breaking changes in the SDK may require updates to `qvac/src/inference/QVACSDKWrapper.js` and `qvac/src/inference/LocalLLM.js`.

## Updating Pear / P2P Stack

The Pear P2P stack (`pear-runtime`, `hyperswarm`, `hypercore`) is managed as npm dependencies:

```bash
cd qvac
npm update pear-runtime hyperswarm hypercore @hyperswarm/secret-stream
# Restart the node and verify P2P connections
npm start
```

Breaking changes in Pear may require updates to `qvac/src/p2p/PearP2P.js`.

## Updating Tauri

Tauri is consumed in two places:
1. `apps/desktop/package.json` (npm deps)
2. `apps/desktop/src-tauri/Cargo.toml` (Rust deps)

```bash
cd apps/desktop
npm update @tauri-apps/api @tauri-apps/cli
# Also update Rust deps
cd src-tauri
cargo update
```

## Updating Capacitor (Mobile)

```bash
cd qvac/frontend
npm update @capacitor/core @capacitor/ios @capacitor/android
npx cap sync
```

## Updating Mining Networks

Each mining network is vendored as a forked Git submodule. The protocol integration layer in `qvac/src/miners/` and `sdk/src/miners/` is thin by design, so upstream improvements can be pulled in with minimal Localchimera changes.

### Workflow

1. **Fork once**: `scripts/fork-upstream.sh <owner>` forks every listed network repo into your GitHub org and repoints `.gitmodules`.
2. **Pull upstream regularly**: `git submodule update --remote --merge upstream/<name>` merges the latest upstream commits into your fork's submodule pointer.
3. **Check protocol changes**: review upstream releases and diffs before updating the submodule pointer.
4. **Test the miner**: run the relevant Localchimera miner in isolation after bumping a submodule.
5. **Commit**: include the upstream release/change reference in the commit message.

## Updating Wiki / Knowledge Base

These are now **vendored as git submodules** in `upstream/` and integrated into the codebase:

- **LLMwiki** — Vendored at `upstream/llmwiki/`. Our `bridge.py` is a thin QVAC-specific wrapper
- **Openviking** — Vendored at `upstream/openviking/`. Integrated via `qvac/src/llmwiki/openviking_bridge.py` using plain urllib over HTTP (no compiled Rust extension needed). Stores wiki content as session memory. Requires the real OpenViking server running at `OPENVIKING_URL` (default `http://localhost:1933`). We also ship a custom image with `llama-cpp-python` and local embeddings pre-installed: `upstream/openviking/Dockerfile.local` + `upstream/openviking/ov.conf`.
- **OtterWiki** — Vendored at `upstream/otterwiki/`. Integrated via `qvac/src/llmwiki/otterwiki_bridge.py` wrapping `GitStorage`. All wiki CRUD (`save`, `get`, `list`, `search`, `delete`) delegates to OtterWiki's git-backed storage.
- **Knowledge Catalog / OKF** — Vendored at `upstream/knowledge-catalog/`. Reference `upstream/knowledge-catalog/okf/SPEC.md`

### How the integrations work

**repo-to-markdown** (`qvac/src/web/repoToMarkdownAdapter.js`)
- Ports the upstream browser JS logic to Node.js
- For GitHub URLs: fetches repo tree via GitHub API, downloads raw files, and concatenates into Markdown
- Local directories still use the directory walker but with upstream-compatible formatting

**OtterWiki** (`qvac/src/llmwiki/otterwiki_bridge.py`)
- Wraps `otterwiki.gitstorage.GitStorage`
- Wiki pages are stored in `llmwiki-data/otterwiki/` as a git repository
- `server.js` calls the bridge via Python subprocess for every wiki operation

**OpenViking** (`qvac/src/llmwiki/openviking_bridge.py`)
- Uses plain urllib to talk to the real OpenViking server over HTTP (no compiled Rust extension needed)
- Stores each saved wiki page as an assistant message in the `chimera-default` session
- Retrieves session context for AI prompts
- Requires the real OpenViking server (see `docs/OPENVIKING.md`)

To incorporate upstream improvements:
1. Update the submodule: `git submodule update --remote upstream/<name>`
2. Compare upstream changes against our wrappers
3. Port changes manually where applicable

## Automated Upstream Checks

A GitHub Action runs weekly to check for new upstream releases and opens an issue if any are found. See `.github/workflows/check-upstream.yml`.

It checks:
- All npm packages (`npm outdated`)
- Does NOT yet check GitHub releases for miner protocols (future enhancement)


---

## PROJECT OVERVIEW

<!-- Source: inference-README.md -->


A Chimera swarm inference node using peer-ranked consensus for the QVAC decentralized compute marketplace testnet.

## What This Is

Networked small language models collaborate via peer-ranked consensus to achieve scale beyond single frontier models. This node runs on Chimera's EVM-based compute marketplace infrastructure.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         CHIMERA TESTNET                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────┐ │
│  │ComputeRegistry│  │  OrderBook   │  │ EscrowVault  │  │Reputation│ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────┬─────┘ │
│         │                 │                 │               │       │
└─────────┼─────────────────┼─────────────────┼───────────────┼───────┘
          │                 │                 │               │
┌─────────▼─────────────────▼─────────────────▼───────────────▼───────┐
│                     CHIMERA COORDINATOR                             │
│         (WebSocket job dispatch, model delivery, heartbeat)         │
└─────────┬─────────────────┬─────────────────┬─────────────────┬───────┘
          │                 │                 │                 │
    ┌─────▼─────┐     ┌─────▼─────┐     ┌─────▼─────┐     ┌──▼────┐
    │  Node A   │◄───►│  Node B   │◄───►│  Node C   │◄───►│Node D │
    │ (Inference│     │ (Inference│     │ (Inference│     │(Judge)│
    │  + Judge) │     │  + Judge) │     │  + Judge) │     │       │
    └─────┬─────┘     └─────┬─────┘     └─────┬─────┘     └──┬────┘
          │                 │                 │              │
          └─────────────────┴─────────────────┴──────────────┘
                            Peer-Ranked Consensus
                         (Bradley-Terry Aggregation)
```

## Key Adaptations

| Original Concept | Chimera Adaptation |
|-------------------|-------------------|
| FOR token staking | ComputeRegistry ETH staking + reputation |
| x402 micropayments | EscrowVault job-based escrow settlement |
| Relay nodes | Chimera Coordinator service |
| Peer-ranked consensus | Reputation.sol weighted aggregation |
| Compute stake | Minimum stake in ComputeRegistry |

## Project Structure

```
chimera-swarm-inference/
├── src/
│   ├── node/           # Inference node runtime
│   ├── consensus/      # Peer-ranked consensus engine
│   ├── contracts/      # Smart contract ABIs and interactions
│   ├── coordinator/    # Chimera coordinator client
│   ├── types/          # Shared type definitions
│   └── utils/          # Utilities (crypto, logging, config)
├── scripts/
│   ├── deploy/         # Chimera testnet deployment
│   └── register/       # Node registration flow
├── tests/              # Unit and integration tests
├── models/             # Small model configs and download scripts
├── docker/             # Container definitions
└── docs/               # Architecture and protocol docs
```

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.10+ (for ONNX runtime model inference)
- Docker & Docker Compose (optional)
- A Chimera testnet wallet with test ETH

### Install

```bash
npm install
pip install -r requirements.txt
```

### Configure

Copy `.env.example` to `.env` and set your values:

```bash
cp .env.example .env
```

Key variables:
- `CHIMERA_RPC_URL` — Chimera testnet RPC endpoint
- `PRIVATE_KEY` — Node operator wallet private key
- `COORDINATOR_WS_URL` — Chimera coordinator WebSocket URL
- `MODEL_PATH` — Local path to cached GGUF/ONNX models

### Register Node

```bash
npx tsx scripts/register/register-node.ts
```

### Run Node

```bash
npx tsx src/node/index.ts
```

### Docker

```bash
docker-compose -f docker/docker-compose.yml up --build
```

## Smart Contract Integration

This node interfaces with four Chimera marketplace contracts:

- **ComputeRegistry** (`0x...`) — Register as a provider, stake minimum deposit
- **OrderBook** (`0x...`) — Place asks for inference capacity
- **EscrowVault** (`0x...`) — Hold/release job payments
- **Reputation** (`0x...`) — Reputation tracking and slashing

Contract addresses are loaded from `config/chimera-testnet.json`.

## License

MIT


---

## CONTRACTS

<!-- Source: contracts/README.md -->


Smart contracts for the Localchimera ecosystem.

## EVM Contracts

Located in this directory and deployed primarily on Arbitrum / EVM-compatible chains.

- Compute registry and order book contracts
- Reputation and escrow contracts
- FHE inference market experiments (see `FHEInferenceMarket.sol`)

## Casper Contracts

See `../contracts-casper/` for Casper Network smart contracts (vault, escrow, provider registry).

## Deployment

Use the Foundry deployment scripts in `../scripts/deploy/`.

```bash
# Example: deploy a single contract (review the script for required env vars)
forge script scripts/deploy/DeployChimera.s.sol --rpc-url $RPC_URL --broadcast
```

## Security

- Never commit private keys or `.env` files.
- Use `PAYOUT_SIGNING_KEY` and similar env vars only at runtime.


---

## CONTRACTS-CASPER

<!-- Source: contracts-casper/README.md -->


Casper Network smart contracts for Localchimera.

## Purpose

These contracts provide:

- **Escrow vault** for job payments and provider payouts
- **Provider registry** for account hashes and relay authorization
- **Job lifecycle** state machine (pending → assigned → done → settled)

## Key Files

- `EscrowVault.sol` / equivalent Casper contract — payment escrow
- `ComputeRegistry.sol` / equivalent — provider registry

## Integration

The SDK and QVAC talk to these contracts via a relay server (private keys live on the relay, not on the untrusted device).

See `../docs/RELAY_COMPATIBILITY.md` for the relay/worker split architecture.


---

## SCRIPTS

<!-- Source: scripts/README.md -->


Automation and utility scripts for Localchimera.

## Subdirectories

- `deploy/` — Foundry and TS/JS deployment scripts for EVM and Casper contracts, plus `deploy-inference.sh`
- `register/` — Node registration scripts
- `testing/` — Smoke tests for BrowserStack, LambdaTest, TestingBot (mobile/desktop QA)
- `debug/` — One-off debugging and inspection scripts
- `utils/` — Utility scripts: key cleanup, balance checks, wallet generation, WASM patching, device verification

## Top-Level Scripts

- `fork-upstream.sh` — Fork tasking/mining network repos into your GitHub org and repoint `.gitmodules`
- `update-tasking-forks.sh` — Pull latest upstream commits into forked tasking submodules
- `update-upstream.sh` — Check/update npm dependencies across packages

## Deployment Quick Start

```bash
# Fork upstream tasking networks
./scripts/fork-upstream.sh <your-github-username>

# Update forked tasking submodules
./scripts/update-tasking-forks.sh

# Check npm dependencies
./scripts/update-upstream.sh check

# Deploy contracts
forge script scripts/deploy/DeployChimera.s.sol:DeployChimera --rpc-url $RPC_URL --broadcast

# Deploy inference infrastructure
./scripts/deploy/deploy-inference.sh
```
