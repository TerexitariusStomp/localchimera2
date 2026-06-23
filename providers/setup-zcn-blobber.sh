#!/usr/bin/env bash
set -euo pipefail
#
# setup-zcn-blobber.sh — Production setup for 0Chain Blobber
#
# Run this once per machine to configure the blobber for earning ZCN.
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BLOBBER_BIN="$PROJECT_ROOT/upstream/zcn-blobber/blobber"
ZCN_DIR="${HOME}/.zcn"
STORAGE_PATH="${ZCN_STORAGE_PATH:-${HOME}/zcn-storage}"

# Configurable via env vars
BLOCK_WORKER="${ZCN_BLOCK_WORKER:-https://demo.zus.network/dns}"
READ_PRICE="${ZCN_READ_PRICE:-0.01}"
WRITE_PRICE="${ZCN_WRITE_PRICE:-1.00}"
CAPACITY="${ZCN_CAPACITY:-1073741824}"  # 1 GB default
MIN_STAKE="${ZCN_MIN_STAKE:-1.0}"
MAX_STAKE="${ZCN_MAX_STAKE:-100.0}"
SERVICE_CHARGE="${ZCN_SERVICE_CHARGE:-0.30}"

if [[ ! -f "$BLOBBER_BIN" ]]; then
  echo "ERROR: Blobber binary not found at $BLOBBER_BIN"
  echo "Build it first: cd upstream/zcn-blobber/code/go/0chain.net/blobber && go build -o ../../../blobber ."
  exit 1
fi

echo "=== 0Chain Blobber Production Setup ==="
echo "Config dir: $ZCN_DIR"
echo "Storage:    $STORAGE_PATH"
echo "Network:    $BLOCK_WORKER"
echo ""

mkdir -p "$ZCN_DIR/config" "$ZCN_DIR/files" "$ZCN_DIR/data" "$STORAGE_PATH"

# 1. Generate keys if not present
if [[ ! -f "$ZCN_DIR/keys.txt" ]]; then
  echo "[1/4] Generating blobber keys..."
  # Generate a BLS key pair for the blobber
  cd "$ZCN_DIR"
  openssl rand -hex 32 > "${ZCN_DIR}/keys.txt"
  echo "Keys generated at $ZCN_DIR/keys.txt"
  echo "⚠️  IMPORTANT: Back up this file. It is your blobber identity."
else
  echo "[1/4] Keys already exist"
fi

# 2. Write blobber config
echo "[2/4] Writing blobber configuration..."
cat > "$ZCN_DIR/config/0chain_blobber.yaml" <<EOF
deployment:
  domain: localhost
  port: 5050
  https_port: 0
  chain_id: 0afc093ffb509f059c55478bc1a60351cef7b4e9c008a79aafc446bbe27cf7ba
  signature_scheme: bls0chain
  block_worker: ${BLOCK_WORKER}
  
read_price: ${READ_PRICE}
write_price: ${WRITE_PRICE}
capacity: ${CAPACITY}
min_lock_demand: 0.1
max_offer_duration: 744h
challenge_completion_time: 1m

min_stake: ${MIN_STAKE}
max_stake: ${MAX_STAKE}
num_delegates: 50
service_charge: ${SERVICE_CHARGE}

delegate_wallet: ''  # <-- SET THIS: your ZCN wallet client_id for rewards

# Storage paths
files_dir: ${STORAGE_PATH}

callback: ''

# Logging
log_dir: ${ZCN_DIR}/log
EOF

# 3. Write validator config
cat > "$ZCN_DIR/config/0chain_validator.yaml" <<EOF
deployment:
  domain: localhost
  port: 5060
  https_port: 0
  chain_id: 0afc093ffb509f059c55478bc1a60351cef7b4e9c008a79aafc446bbe27cf7ba
  signature_scheme: bls0chain
  block_worker: ${BLOCK_WORKER}

delegate_wallet: ''  # <-- SET THIS: your ZCN wallet client_id for rewards

min_stake: ${MIN_STAKE}
max_stake: ${MAX_STAKE}
num_delegates: 50
service_charge: ${SERVICE_CHARGE}
EOF

# 4. Create systemd service
echo "[3/4] Creating systemd service..."
mkdir -p "${HOME}/.config/systemd/user"
cat > "${HOME}/.config/systemd/user/zcn-blobber.service" <<EOF
[Unit]
Description=0Chain Blobber Storage Node
After=network.target

[Service]
Type=simple
WorkingDirectory=${ZCN_DIR}
ExecStart=${BLOBBER_BIN} --configDir ${ZCN_DIR}/config --port 5050
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

echo "[4/4] Setup complete"
echo ""
echo "=== NEXT STEPS TO EARN ==="
echo ""
echo "1. CREATE A ZCN WALLET"
echo "   Install zwalletcli: https://github.com/0chain/zwalletcli"
echo "   Run: zwalletcli createwallet --wallet mywallet.json"
echo "   Copy the 'client_id' from the output."
echo ""
echo "2. SET DELEGATE WALLET"
echo "   Edit: $ZCN_DIR/config/0chain_blobber.yaml"
echo "   Edit: $ZCN_DIR/config/0chain_validator.yaml"
echo "   Set delegate_wallet to your client_id"
echo ""
echo "3. FUND WALLET"
echo "   Send ZCN + ETH (for gas) to your wallet"
echo "   Use Bolt wallet: https://bolt.holdings/"
echo ""
echo "4. STAKE TOKENS"
echo "   Run: zbox sp-lock --blobber_id <your_blobber_id> --tokens 0.5"
echo "   (This registers you and locks stake for challenges)"
echo ""
echo "5. START NODE"
echo "   systemctl --user enable --now zcn-blobber"
echo "   Or manually: ${BLOBBER_BIN} --configDir ${ZCN_DIR}/config --port 5050"
echo ""
echo "Earnings:"
echo "  - Storage rent: paid by users storing data on your node"
echo "  - Staking rewards: share of block rewards based on stake"
echo "  - Quality score: higher = more allocations, more earnings"
