# Chimera-Fortytwo Node

A fork of Fortytwo's swarm inference protocol adapted for the Chimera (QVAC) decentralized compute marketplace testnet.

## What This Is

Fortytwo pioneered **swarm inference**: networked small language models collaborate via peer-ranked consensus to achieve scale beyond single frontier models. This codebase ports that architecture to run on Chimera's EVM-based compute marketplace infrastructure.

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

## Key Adaptations from Fortytwo

| Fortytwo Original | Chimera Adaptation |
|-------------------|-------------------|
| FOR token staking | ComputeRegistry ETH staking + reputation |
| x402 micropayments | EscrowVault job-based escrow settlement |
| Relay nodes | Chimera Coordinator service |
| Peer-ranked consensus | Reputation.sol weighted aggregation |
| Compute stake | Minimum stake in ComputeRegistry |

## Project Structure

```
chimera-fortytwo-node/
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
