# QVAC-Pear Miner Node

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

The protocol maintains **shared multisigs** for Nostr and Bittensor. All applications use the same protocol addresses — no per-app generation required.

- **Nostr (Routstr)** — Cashu NIP-60 P2SH protocol multisig (2-of-3)
- **Bittensor (Chutes)** — Substrate protocol multisig (2-of-3)
- **EVM** — Direct deposit to machine owner address
- **Solana (Earnidle)** — Direct deposit (separate wallet)

### Two-Sweep Architecture

**Step 1 — Weekly Collection** (`scripts/weekly-fund-sweep.js`)
- Collects funds from all network protocol multisigs (Nostr, Bittensor, Solana, Arbitrum) into the EVM collection multisig
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

Open `https://miner.templeearth.cc` on your phone. Tap **"Add to Home Screen"** — it installs as a PWA and works offline. No APK, no app store, no download.

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
- **Multi-Miner Support** - Chutes, Routstr, Earnidle, BTT AI, Golem, Anyone Protocol, Mysterium, Casper
- **Centralized Inference** - All miners route through single QVAC inference node

## Features

- **Dual Mode Operation**: Serves AI inference when active, switches to mining when idle
- **P2P Distribution**: Apps distributed via Pear runtime without cloud infrastructure
- **Zero-Auth Installation**: Simple sign-in with consent flow, no complex authentication
- **Distributed Storage**: Hypercore for secure, distributed data storage
- **Multi-Miner Support**: Automatically switches between 5 different mining protocols
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

## Miner Integration

### Chutes
GPU mining system with automatic GPU validation.

### Earnidle
Protocol for putting idle compute resources to work across multiple venues.

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
