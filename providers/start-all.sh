#!/bin/bash
# localchimera — Provider Startup Script
# Untrusted-hardware-safe: Chutes, Routstr, BTT AI, Golem, Anyone Protocol, Mysterium, Casper (relay mode)
# Self-managed (local keys required): BTFS, ZCN
# Removed (incompatible with untrusted hardware): Akash, Targon, CESS, Income Generator, CashPilot, Salad

set -e
LOGDIR="/home/user/CascadeProjects/qvac-chimera/providers/logs"
mkdir -p "$LOGDIR"

echo "======================================"
echo " localchimera Provider Launcher"
echo " Untrusted-safe: Chutes, Routstr, BTT AI, Golem, Anyone Protocol, Mysterium, Casper (relay)"
echo " Self-managed:  BTFS, ZCN"
echo "======================================"

# 1. BTFS STORAGE NODE (self-managed — requires local BTT wallet)
echo "[1/7] BTFS Storage Node..."
if [ -f /home/user/CascadeProjects/qvac-chimera/upstream/btfs/btfs ]; then
  if [ -d "${HOME}/.btfs" ]; then
    echo "  Repo initialized. Starting BTFS daemon..."
    BTFS_PATH="${HOME}/.btfs" nohup /home/user/CascadeProjects/qvac-chimera/upstream/btfs/btfs daemon --enable-storage-host > "$LOGDIR/btfs.log" 2>&1 &
    echo $! > "$LOGDIR/btfs.pid"
    echo "  BTFS PID: $!"
    echo "  UI: http://127.0.0.1:5001/hostui"
    echo "  ⚠️  SELF-MANAGED: needs BTT wallet funding for earnings on this machine"
  else
    echo "  Repo not initialized. Run: ./providers/setup-btfs.sh"
  fi
else
  echo "  BTFS binary not found. Build: cd upstream/btfs && go build -o btfs ./cmd/btfs"
fi

# 2. 0CHAIN BLOBBER (self-managed — requires local ZCN wallet + stake)
echo ""
echo "[2/7] 0Chain Blobber..."
if [ -f /home/user/CascadeProjects/qvac-chimera/upstream/zcn-blobber/blobber ]; then
  if [ -f "${HOME}/.zcn/config/0chain_blobber.yaml" ]; then
    echo "  Config exists. Starting blobber..."
    nohup /home/user/CascadeProjects/qvac-chimera/upstream/zcn-blobber/blobber --configDir "${HOME}/.zcn/config" --port 5050 > "$LOGDIR/zcn-blobber.log" 2>&1 &
    echo $! > "$LOGDIR/zcn-blobber.pid"
    echo "  Blobber PID: $!"
    echo "  ⚠️  SELF-MANAGED: needs ZCN wallet + stake for earnings on this machine"
  else
    echo "  Config not found. Run: ./providers/setup-zcn-blobber.sh"
  fi
else
  echo "  Blobber binary not found. Build: cd upstream/zcn-blobber/code/go/0chain.net/blobber && go build -o ../../../blobber ."
fi

# 3. BTT AI MINER (GPU tasking network — vLLM/SGLang; untrusted-safe if proxy mode used)
echo ""
echo "[3/7] BTT AI Miner (GPU tasking)..."
if [ -d /home/user/CascadeProjects/qvac-chimera/upstream/btt-ai-miner ]; then
  if command -v nvidia-smi >/dev/null 2>&1; then
    echo "  GPU detected. BTT AI miner can run."
    echo "  TO START: cd upstream/btt-ai-miner && pip install -e . && miner-cli up -f miner.yaml"
    echo "  (needs miner.yaml config + wallet funding for earnings)"
  else
    echo "  NVIDIA GPU not detected. BTT AI miner requires GPU."
  fi
else
  echo "  BTT AI miner not found. Clone: git submodule add https://github.com/BTT-AI-labs/miner-cli.git upstream/btt-ai-miner"
fi

# 4. GOLEM PROVIDER (decentralized compute marketplace — Docker-based, no local keys)
echo ""
echo "[4/7] Golem Provider (decentralized compute)..."
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

# 5. ANYONE PROTOCOL (onion routing relay — Docker-based, no keys required)
echo ""
echo "[5/7] Anyone Protocol Relay (onion routing)..."
if command -v docker >/dev/null 2>&1; then
  echo "  Docker available. Anyone Protocol relay can run."
  echo "  TO START: docker run -d --name anon-relay --net host ghcr.io/anyone-protocol/ator-protocol:latest-manual"
  echo "  Ports: OR 9001, DIR 9030 (must be open/firewalled)"
else
  echo "  Docker not available. Anyone Protocol relay requires Docker."
fi

# 6. MYSTERIUM VPN NODE (Docker-based, no keys required)
echo ""
echo "[6/7] Mysterium VPN Node..."
if command -v docker >/dev/null 2>&1; then
  echo "  Docker available. Mysterium node can run."
  echo "  TO START: docker run --cap-add NET_ADMIN --net host -d --name myst mysteriumnetwork/myst:latest service --agreed-terms-and-conditions"
  echo "  UI: http://localhost:4449"
else
  echo "  Docker not available. Mysterium node requires Docker."
fi

# 7. QVAC NATIVE MINERS (managed by ChimeraSDK / NodeManager)
echo ""
echo "[7/7] QVAC Native Miners..."
echo "  Chutes    (Bittensor subnet — inference provider)"
echo "  Routstr   (Nostr/Cashu AI inference router — no external credentials)"
echo "  Casper    (Casper Network escrow bridge — relay mode, no local keys)"

echo ""
echo "======================================"
echo " Removed providers (incompatible with untrusted hardware):"
echo "   - Akash            (requires local AKT wallet + k3s)"
echo "   - Targon           (requires local hotkey + 1000 TAO stake)"
echo "   - CESS             (requires local CESS wallet + stake)"
echo "   - Income Generator (requires per-app credentials)"
echo "   - CashPilot        (requires service credentials)"
echo "   - Salad            (proprietary container host, not self-hosted)"
echo " Removed providers (require GPU):"
echo "   - nosana-cli"
echo "   - lium-io"
echo "   - heurist-miner-release"
echo "   - byteleap-worker"
echo "======================================"
