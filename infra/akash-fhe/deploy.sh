#!/usr/bin/env bash
set -euo pipefail

FHE_TIER="${FHE_TIER:-fhe-h100}"
FHE_MODEL_NAME="${FHE_MODEL_NAME:-lfm2.5-230m}"
AKASH_WALLET="${AKASH_WALLET:-mykey}"
SDL_FILE="${SDL_FILE:-deploy.yml}"

echo "Deploying FHE inference tier: ${FHE_TIER}"
echo "Model: ${FHE_MODEL_NAME}"

TMP_SDL=$(mktemp --suffix=.yml)
trap 'rm -f "${TMP_SDL}"' EXIT

# Select the requested profile in the deployment section
python3 - <<PY
import re
from pathlib import Path

src = Path("${SDL_FILE}").read_text()
sdl = re.sub(
    r'(deployment:\n\s+fhe-inference:\n\s+akash:\n\s+profile:) \w+',
    r'\1 ${FHE_TIER}',
    src
)
Path("${TMP_SDL}").write_text(sdl)
print(f"SDL profile set to ${FHE_TIER}")
PY

# Deploy to Akash using provider-services (matches docs/WALLETS_CREATED.md)
provider-services tx deployment create "${TMP_SDL}" \
    --from "${AKASH_WALLET}" \
    --node https://rpc.akashnet.net:443 \
    --chain-id akashnet-2 \
    --fees 5000uakt \
    -y

echo "Deployment submitted to Akash."
echo "Monitor with: provider-services provider lease-status --dseq <DSEQ> --from ${AKASH_WALLET}"
