#!/bin/bash
# localchimera — Provider Startup Script
# Active providers: Akash, Salad, Targon, BTFS, 0Chain Blobber

set -e
LOGDIR="/home/user/CascadeProjects/qvac-chimera/providers/logs"
mkdir -p "$LOGDIR"

echo "======================================"
echo " localchimera Provider Launcher"
echo " Active: Akash, Salad, Targon, BTFS, 0Chain"
echo "======================================"

# 1. AKASH PROVIDER (best CPU earner)
echo "[1/3] Akash Provider..."
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
echo "[2/3] Salad Worker (local mode)..."
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
echo "[3/5] Targon CPU Provider..."
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
echo "[4/5] BTFS Storage Node..."
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
echo "[5/5] 0Chain Blobber..."
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
echo "======================================"
