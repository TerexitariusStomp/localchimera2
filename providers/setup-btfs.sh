#!/usr/bin/env bash
set -euo pipefail
#
# setup-btfs.sh — Production setup for BTFS storage node
#
# Run this once per machine to initialize BTFS for earning BTT.
#

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BTFS_BIN="$PROJECT_ROOT/upstream/btfs/btfs"
BTFS_REPO="${HOME}/.btfs"
STORAGE_PATH="${BTFS_STORAGE_PATH:-${HOME}/btfs-storage}"
STORAGE_MAX="${BTFS_STORAGE_MAX:-100GB}"

if [[ ! -f "$BTFS_BIN" ]]; then
  echo "ERROR: BTFS binary not found at $BTFS_BIN"
  echo "Build it first: cd upstream/btfs && go build -o btfs ./cmd/btfs"
  exit 1
fi

echo "=== BTFS Production Setup ==="
echo "Repo:     $BTFS_REPO"
echo "Storage:  $STORAGE_PATH ($STORAGE_MAX)"
echo ""

# 1. Initialize BTFS repo if not already present
if [[ ! -d "$BTFS_REPO" ]]; then
  echo "[1/5] Initializing BTFS repo..."
  mkdir -p "$BTFS_REPO"
  BTFS_PATH="$BTFS_REPO" "$BTFS_BIN" init --profile=server
else
  echo "[1/5] BTFS repo already exists — skipping init"
fi

# 2. Configure storage host settings
echo "[2/5] Configuring storage host..."
mkdir -p "$STORAGE_PATH"

BTFS_PATH="$BTFS_REPO" "$BTFS_BIN" config --json StorageMax '"'$STORAGE_MAX'"'
BTFS_PATH="$BTFS_REPO" "$BTFS_BIN" config --json Experimental.StorageHostEnabled true

# 3. Enable airdrops (passive earning for online nodes)
echo "[3/5] Enabling airdrop rewards..."
BTFS_PATH="$BTFS_REPO" "$BTFS_BIN" config --json Experimental.AirdropEnabled true

# 4. Set API and gateway ports
echo "[4/5] Configuring API ports..."
BTFS_PATH="$BTFS_REPO" "$BTFS_BIN" config Addresses.API /ip4/127.0.0.1/tcp/5001
BTFS_PATH="$BTFS_REPO" "$BTFS_BIN" config Addresses.Gateway /ip4/127.0.0.1/tcp/8080

# 5. Create systemd service file for auto-start
echo "[5/5] Creating systemd service..."
cat > "${HOME}/.config/systemd/user/btfs.service" <<EOF
[Unit]
Description=BTFS Storage Node
After=network.target

[Service]
Type=simple
Environment=BTFS_PATH=${BTFS_REPO}
ExecStart=${BTFS_BIN} daemon --enable-storage-host --storage-max ${STORAGE_MAX}
Restart=on-failure
RestartSec=10

[Install]
WantedBy=default.target
EOF

mkdir -p "${HOME}/.config/systemd/user"
echo "Systemd service created at ~/.config/systemd/user/btfs.service"
echo ""

echo "=== Setup Complete ==="
echo ""
echo "To earn BTT you need:"
echo "  1. BTT tokens in a TRON wallet (import into BTFS UI at http://127.0.0.1:5001/hostui)"
echo "  2. Forward port 4001/TCP for P2P connectivity"
echo "  3. Start the node:  BTFS_PATH=${BTFS_REPO} ${BTFS_BIN} daemon --enable-storage-host"
echo "  4. Or use systemd:    systemctl --user enable --now btfs"
echo ""
echo "Earnings:"
echo "  - Storage rent: paid in BTT by renters"
echo "  - Airdrops: daily BTT rewards for online storage nodes"
