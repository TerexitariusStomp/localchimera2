#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RELAYER_DIR="$REPO_ROOT/upstream/fhevm/relayer"
CONFIG_SRC="$REPO_ROOT/inference-config/relayer.local.mainnet.yaml"
CONFIG_DST="$RELAYER_DIR/config/local.mainnet.yaml"
ENV_SRC="$REPO_ROOT/inference-config/relayer.env.example"
ENV_DST="$RELAYER_DIR/.env"

echo "Copying relayer config..."
cp "$CONFIG_SRC" "$CONFIG_DST"

if [ ! -f "$ENV_DST" ]; then
  echo "Creating $ENV_DST from example. Please edit it and re-run."
  cp "$ENV_SRC" "$ENV_DST"
  echo "Required: set APP_GATEWAY__TX_ENGINE__SIGNER__PRIVATE_KEY with your funded Gateway mainnet key."
  exit 1
fi

if ! grep -q 'APP_GATEWAY__TX_ENGINE__SIGNER__PRIVATE_KEY=0x' "$ENV_DST" 2>/dev/null; then
  echo "Error: APP_GATEWAY__TX_ENGINE__SIGNER__PRIVATE_KEY is not set in $ENV_DST"
  exit 1
fi

echo "Loading environment variables..."
set -a
source "$ENV_DST"
set +a

echo "Injecting private key into relayer config..."
sed -i "s|private_key: \"\"|private_key: \"$APP_GATEWAY__TX_ENGINE__SIGNER__PRIVATE_KEY\"|" "$CONFIG_DST"

cd "$RELAYER_DIR"

echo "Running database migrations..."
DATABASE_URL="$APP_STORAGE__SQL_DATABASE_URL" MAX_ATTEMPTS=20 \
  cargo run --manifest-path relayer-migrate/Cargo.toml --bin relayer-migrate

echo "Running preflight check..."
CI=1 YES=1 make preflight-mainnet

echo "Starting relayer..."
cargo run --bin fhevm-relayer -- --config-file "$CONFIG_DST"
