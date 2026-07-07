#!/usr/bin/env bash
set -euo pipefail

# Production deploy script for the Chimera resource provisioner worker.

cd "$(dirname "$0")"

echo "[deploy] building worker image..."
docker build -t chimera-resource-provisioner .

echo "[deploy] starting services..."
docker compose up -d

echo "[deploy] provisioner is running."
echo "[deploy] check logs with: docker compose logs -f resource-provisioner"
