#!/bin/bash
# Verify production readiness for the resource provisioner.
set -e

echo "=== Production Verification ==="

# 1. Environment
if [ ! -f .env ]; then
  echo "ERROR: .env file not found"
  exit 1
fi

echo "[ok] .env exists"

for var in PRIVATE_KEY RPC_URL CHAIN_ID CLOUDFLARE_ACCOUNT_ID CLOUDFLARE_KV_NAMESPACE_ID CLOUDFLARE_API_TOKEN GOLEM_API_KEY GOLEM_PAYMENT_NETWORK STREAMR_NODE_PRIVATE_KEY STREAMR_STREAM_ID NAMESILO_API_KEY; do
  value=$(grep "^${var}=" .env | cut -d= -f2- || true)
  if [ -z "$value" ]; then
    echo "ERROR: ${var} is not set"
    exit 1
  fi
  echo "[ok] ${var} set"
done

# 2. Syntax checks
echo "[info] running syntax checks..."
for f in src/index.js src/scaling-controller.js src/provision/*.js src/infra/*.js src/dispatcher/*.js src/contracts/*.js src/coordinator/*.js scripts/*.js; do
  node --check "$f"
done
echo "[ok] all JS files pass syntax check"

# 3. Yagna
if ! command -v yagna >/dev/null 2>&1; then
  echo "ERROR: yagna is not installed"
  exit 1
fi

if ! yagna app-key list >/dev/null 2>&1; then
  echo "ERROR: yagna is not running"
  exit 1
fi
echo "[ok] yagna installed and running"

# 4. Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "[warn] docker is not installed; deploy step will not work"
else
  echo "[info] checking docker..."
  docker compose config >/dev/null
  echo "[ok] docker compose config valid"
fi

# 5. Fallback configuration
fallback_ready=0
if [ -n "$(grep '^CASPER_PROVIDER_KEY_PEM=' .env | cut -d= -f2- || true)" ] || [ -n "$(grep '^CASPER_PROVIDER_KEY_PEM_PATH=' .env | cut -d= -f2- || true)" ]; then
  fallback_ready=1
  echo "[ok] Casper fallback provider key configured"
fi
if [ -n "$(grep '^BOTCHAIN_PRIVATE_KEY=' .env | cut -d= -f2- || true)" ]; then
  fallback_ready=1
  echo "[ok] Botchain fallback private key configured"
fi
if [ -n "$(grep '^COORDINATOR_PORT=' .env | cut -d= -f2- || true)" ]; then
  echo "[ok] Coordinator port configured"
fi
if [ "$fallback_ready" -eq 0 ]; then
  echo "[warn] No Casper/Botchain fallback keys configured; escrow fallback will be disabled"
fi

echo "=== Verification complete ==="
