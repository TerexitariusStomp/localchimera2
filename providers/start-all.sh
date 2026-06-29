#!/bin/bash
# localchimera — Provider Startup Script
# Only untrusted-hardware-safe networks are included.

set -e
LOGDIR="/home/user/CascadeProjects/qvac-chimera/providers/logs"
mkdir -p "$LOGDIR"

echo "======================================"
echo " localchimera Provider Launcher"
echo " Untrusted-safe: Chutes, Routstr, BTT AI, Golem, Anyone Protocol, Mysterium, Casper (relay), BTFS"
echo "======================================"

# 1. BTT AI MINER (GPU tasking network — vLLM/SGLang; proxy mode, no local wallet)
echo "[1/5] BTT AI Miner (GPU tasking)..."
if [ -d /home/user/CascadeProjects/qvac-chimera/upstream/btt-ai-miner ]; then
  if command -v nvidia-smi >/dev/null 2>&1; then
    echo "  GPU detected. BTT AI miner can run."
    echo "  TO START: cd upstream/btt-ai-miner && pip install -e . && miner-cli up -f miner.yaml"
    echo "  (proxy mode; relay holds the wallet)"
  else
    echo "  NVIDIA GPU not detected. BTT AI miner requires GPU."
  fi
else
  echo "  BTT AI miner not found. Clone: git submodule add https://github.com/BTT-AI-labs/miner-cli.git upstream/btt-ai-miner"
fi

# 2. GOLEM PROVIDER (decentralized compute marketplace — Docker-based, no local keys)
echo ""
echo "[2/5] Golem Provider (decentralized compute)..."
if command -v docker >/dev/null 2>&1; then
  if [ -c /dev/kvm ]; then
    echo "  Docker + KVM available. Golem provider can run."
    echo "  TO START: docker run -d --name yagna-provider --privileged -v /dev/kvm:/dev/kvm golemfactory/yagna:latest provider run"
    echo "  (payout address only — node identity managed inside container)"
  else
    echo "  KVM not available (/dev/kvm missing). Golem provider requires nested virtualization."
  fi
else
  echo "  Docker not available. Golem provider requires Docker."
fi

# 3. ANYONE PROTOCOL (onion routing relay — Docker-based, no keys required)
echo ""
echo "[3/5] Anyone Protocol Relay (onion routing)..."
if command -v docker >/dev/null 2>&1; then
  echo "  Docker available. Anyone Protocol relay can run."
  echo "  TO START: docker run -d --name anon-relay --net host ghcr.io/anyone-protocol/ator-protocol:latest-manual"
  echo "  Ports: OR 9001, DIR 9030 (must be open/firewalled)"
else
  echo "  Docker not available. Anyone Protocol relay requires Docker."
fi

# 4. MYSTERIUM VPN NODE (Docker-based, no keys required)
echo ""
echo "[4/5] Mysterium VPN Node..."
if command -v docker >/dev/null 2>&1; then
  echo "  Docker available. Mysterium node can run."
  echo "  TO START: docker run --cap-add NET_ADMIN --net host -d --name myst mysteriumnetwork/myst:latest service --agreed-terms-and-conditions"
  echo "  UI: http://localhost:4449"
else
  echo "  Docker not available. Mysterium node requires Docker."
fi

# 5. QVAC NATIVE MINERS (managed by ChimeraSDK / NodeManager)
echo ""
echo "[5/5] QVAC Native Miners..."
echo "  Chutes    (Bittensor subnet — inference provider)"
echo "  Routstr   (Nostr/Cashu AI inference router — no external credentials)"
echo "  BTFS      (Walletless storage node — Docker daemon, no BTT wallet on device)"
echo "  Casper    (Casper Network escrow bridge — relay mode, no local keys)"
echo "  Earnidle  (IDLE inference — public Solana wallet address only)"

echo ""
echo "======================================"
echo "See docs/RELAY_COMPATIBILITY.md for archived analysis of excluded networks."
echo "======================================"
