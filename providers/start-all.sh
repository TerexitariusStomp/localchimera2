#!/bin/bash
# localchimera — Provider Startup Script
# Active providers: Akash, Salad, Targon, BTFS, 0Chain, Income Generator, CashPilot, CESS

set -e
LOGDIR="/home/user/CascadeProjects/qvac-chimera/providers/logs"
mkdir -p "$LOGDIR"

echo "======================================"
echo " localchimera Provider Launcher"
echo " Active: Akash, Salad, Targon, BTFS, 0Chain, Income Generator, CashPilot, CESS"
echo "======================================"

# 1. AKASH PROVIDER (best CPU earner)
echo "[1/8] Akash Provider..."
if provider-services version >/dev/null 2>&1; then
  echo "  Wallet: mykey -> AKASH_ADDRESS_REDACTED"
  echo "  k3s:"
  sudo kubectl --kubeconfig /etc/rancher/k3s/k3s.yaml get nodes 2>/dev/null || echo "  kubectl failed"
  echo "  TO START: provider-services run --from mykey --node https://rpc.akashnet.net:443"
  echo "  (needs AKT wallet funding + on-chain registration)"
else
  echo "  provider-services not found"
fi

# 2. SALAD JOB QUEUE WORKER (local dev mode)
echo ""
echo "[2/8] Salad Worker (local mode)..."
cd /home/user/CascadeProjects/qvac-chimera/upstream/salad-job-queue-worker
if [ -f ./salad-worker ]; then
  SALAD_LOCAL_MODE=true SALAD_LOCAL_TOKEN=dev-token \
    nohup ./salad-worker > "$LOGDIR/salad.log" 2>&1 &
  echo $! > "$LOGDIR/salad.pid"
  echo "  Salad PID: $!"
else
  echo "  Salad binary not found."
fi

# 3. TARGON CPU PROVIDER
echo ""
echo "[3/8] Targon CPU Provider..."
cd /home/user/CascadeProjects/qvac-chimera/upstream/targon
if [ -f ./targon-cli ]; then
  echo "  Hotkey configured in config.json"
  echo "  TO START: ./targon-cli"
  echo "  (needs 1000 TAO stake + on-chain registration)"
else
  echo "  targon-cli not found. Build: cd targon && go build -o targon-cli ./cmd/targon-cli"
fi

# 4. BTFS STORAGE NODE
echo ""
echo "[4/8] BTFS Storage Node..."
if [ -f /home/user/CascadeProjects/qvac-chimera/upstream/btfs/btfs ]; then
  if [ -d "${HOME}/.btfs" ]; then
    echo "  Repo initialized. Starting BTFS daemon..."
    BTFS_PATH="${HOME}/.btfs" nohup /home/user/CascadeProjects/qvac-chimera/upstream/btfs/btfs daemon --enable-storage-host > "$LOGDIR/btfs.log" 2>&1 &
    echo $! > "$LOGDIR/btfs.pid"
    echo "  BTFS PID: $!"
    echo "  UI: http://127.0.0.1:5001/hostui"
    echo "  (needs BTT wallet funding for earnings)"
  else
    echo "  Repo not initialized. Run: ./providers/setup-btfs.sh"
  fi
else
  echo "  BTFS binary not found. Build: cd upstream/btfs && go build -o btfs ./cmd/btfs"
fi

# 5. 0CHAIN BLOBBER
echo ""
echo "[5/8] 0Chain Blobber..."
if [ -f /home/user/CascadeProjects/qvac-chimera/upstream/zcn-blobber/blobber ]; then
  if [ -f "${HOME}/.zcn/config/0chain_blobber.yaml" ]; then
    echo "  Config exists. Starting blobber..."
    nohup /home/user/CascadeProjects/qvac-chimera/upstream/zcn-blobber/blobber --configDir "${HOME}/.zcn/config" --port 5050 > "$LOGDIR/zcn-blobber.log" 2>&1 &
    echo $! > "$LOGDIR/zcn-blobber.pid"
    echo "  Blobber PID: $!"
    echo "  (needs ZCN wallet + stake for earnings)"
  else
    echo "  Config not found. Run: ./providers/setup-zcn-blobber.sh"
  fi
else
  echo "  Blobber binary not found. Build: cd upstream/zcn-blobber/code/go/0chain.net/blobber && go build -o ../../../blobber ."
fi

# 6. INCOME GENERATOR (bandwidth sharing)
echo ""
echo "[6/8] Income Generator (bandwidth)..."
if [ -d /home/user/CascadeProjects/qvac-chimera/upstream/income-generator ]; then
  if docker compose version >/dev/null 2>&1; then
    echo "  Starting Income Generator Docker stack..."
    cd /home/user/CascadeProjects/qvac-chimera/upstream/income-generator
    docker compose -f compose/compose.yml up -d > "$LOGDIR/income-generator.log" 2>&1
    echo "  Income Generator started (docker compose)"
    echo "  (needs app credentials in compose/.env for earnings)"
  else
    echo "  Docker Compose not available"
  fi
else
  echo "  Income Generator not found. Clone: git submodule add https://github.com/XternA/income-generator.git upstream/income-generator"
fi

# 7. CASHPILOT (DePIN manager)
echo ""
echo "[7/8] CashPilot (DePIN manager)..."
if [ -d /home/user/CascadeProjects/qvac-chimera/upstream/cashpilot ]; then
  if docker compose version >/dev/null 2>&1; then
    echo "  Starting CashPilot Docker stack..."
    cd /home/user/CascadeProjects/qvac-chimera/upstream/cashpilot
    docker compose up -d > "$LOGDIR/cashpilot.log" 2>&1
    echo "  CashPilot started (docker compose)"
    echo "  UI: http://localhost:8080"
    echo "  (needs service credentials for earnings)"
  else
    echo "  Docker Compose not available"
  fi
else
  echo "  CashPilot not found. Clone: git submodule add https://github.com/GeiserX/CashPilot.git upstream/cashpilot"
fi

# 8. CESS STORAGE NODE
echo ""
echo "[8/8] CESS Storage Node..."
if [ -d /home/user/CascadeProjects/qvac-chimera/upstream/cess-nodeadm ]; then
  if command -v cess >/dev/null 2>&1; then
    echo "  Starting CESS node..."
    sudo cess start > "$LOGDIR/cess.log" 2>&1
    echo "  CESS started"
    echo "  (needs ZCN stake + storage for earnings)"
  else
    echo "  CESS CLI not installed. Run: cd upstream/cess-nodeadm && sudo ./install.sh"
  fi
else
  echo "  CESS nodeadm not found. Clone: git submodule add https://github.com/CESSProject/cess-nodeadm.git upstream/cess-nodeadm"
fi

echo ""
echo "======================================"
echo " Removed providers (require GPU):"
echo "   - nosana-cli"
echo "   - lium-io"
echo "   - heurist-miner-release"
echo "   - byteleap-worker"
echo " Removed providers (not consumer-friendly):"
echo "   - sia-hostd (needs 4 TB+ storage)"
echo "   - filecoin-lotus (needs 256 GB RAM + GPU)"
echo "   - arweave-node (archival weave)"
echo "   - hippius-storage-miner (complex Ansible)"
echo " Removed providers (browser-only, not self-hosted):"
echo "   - b1m.ai (browser extension)"
echo "   - Grass (browser extension / desktop app)"
echo "   - FilBeam (no valid self-hosted repo)"
echo "======================================"
