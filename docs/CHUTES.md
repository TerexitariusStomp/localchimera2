# Chutes.ai Network Integration

## Overview

Chutes is a **Bittensor subnet** for decentralized GPU compute. Providers offer inference capacity and earn **TAO** rewards.

Chimera integrates as a Chutes provider by exposing its local QVAC inference through the Chutes network.

- **Platform:** https://chutes.ai
- **Docs:** https://chutes.ai/docs
- **Auth:** Bittensor wallet (coldkey + hotkey)
- **Rewards:** TAO (Bittensor native token)

## Architecture

```
[Client] ──Chutes API──> [Chutes Router] ──HTTP──> [Chimera :3002/v1]
                                           │
                                           └── TAO payments
```

## Setup Steps

### Step 1 — Install Bittensor Wallet

```bash
# Install Bittensor (older version avoids Rust compilation)
pip install 'bittensor<8'

# Create coldkey (main wallet)
btcli wallet new_coldkey --wallet.name chimera --n_words 24

# Create hotkey (for signing transactions)
btcli wallet new_hotkey --wallet.name chimera --wallet.hotkey default --n_words 24

# Verify
ls ~/.bittensor/wallets/chimera/
```

**Backup your keys** — they cannot be recovered if lost.

### Step 2 — Install Chutes CLI

```bash
pip install chutes
```

### Step 3 — Register with Chutes

```bash
chutes register --wallet chimera --hotkey default
```

This will:
1. Ask for a username
2. Select your wallet/hotkey
3. Verify with a registration token
4. Generate `~/.chutes/config.ini`

### Step 4 — Create API Key

```bash
chutes keys create --name chimera-key
```

Copy the API key (starts with `cpk_`) into `qvac/config.json`:

```json
"chutes": {
  "enabled": true,
  "config": {
    "apiKey": "cpk_your_key_here",
    "endpoint": "http://localchimera.com:3002/v1"
  }
}
```

### Step 5 — Start Chimera Node

```bash
cd qvac && node src/index.js
```

The `ChutesMiner` will:
1. Read `~/.chutes/config.ini` for wallet info
2. Use the API key to authenticate with Chutes
3. Register your node as an inference provider
4. Heartbeat every 30 seconds

## Config Fields

```json
"chutes": {
  "enabled": true,
  "config": {
    "network": "bittensor",
    "platform": "https://chutes.ai",
    "walletAddress": "",          // Bittensor SS58 address
    "hotkeyAddress": "",          // Parsed from config.ini
    "apiKey": "",                 // cpk_... from chutes keys create
    "apiBaseUrl": "https://api.chutes.ai",
    "inferenceBaseUrl": "https://llm.chutes.ai/v1",
    "chutesHome": "~/.chutes",
    "endpoint": "http://localchimera.com:3002/v1"
  }
}
```

## Where Your Node Appears

- **Dashboard:** https://chutes.ai
- **Node list:** https://chutes.ai/docs/api-reference/nodes
- **Your provider page:** https://chutes.ai/nodes (after registration)

## Troubleshooting

| Issue | Fix |
|---|---|
| `No Bittensor wallet` | Run `btcli wallet new_coldkey` |
| `No Chutes config` | Run `chutes register` |
| `No API key` | Run `chutes keys create` |
| `401 Unauthorized` | Check API key is valid and copied correctly |
| `Node not showing` | Verify endpoint is reachable from internet |

## Manual API Test

```bash
curl -H "Authorization: Bearer cpk_your_key" \
  https://api.chutes.ai/users/me
```
