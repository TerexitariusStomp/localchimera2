#!/usr/bin/env bash
set -euo pipefail

# Deploy FHE inference to Akash using the Console Managed Wallet API.
# No local private keys or AKT wallet needed; billing is via the Console account.
#
# Usage:
#   export AKASH_API_KEY=ac.sk.production.xxx
#   export FHE_TIER=fhe-rtx4090
#   ./deploy-console.sh

FHE_TIER="${FHE_TIER:-fhe-rtx4090}"
SDL_FILE="${SDL_FILE:-deploy.yml}"
CONSOLE_API="${CONSOLE_API:-https://console-api.akash.network}"
DEPOSIT_USD="${DEPOSIT_USD:-0.5}"
GHCR_USERNAME="${GHCR_USERNAME:-localchimera}"
GHCR_TOKEN="${GHCR_TOKEN:-}"
FHE_MODEL_NAME="${FHE_MODEL_NAME:-lfm2.5-230m}"

echo "Deploying FHE inference to Akash via Console API"
echo "Tier: ${FHE_TIER}"
echo "Deposit: ${DEPOSIT_USD} USD"

if [ -z "${GHCR_TOKEN}" ]; then
    echo "WARNING: GHCR_TOKEN is not set. Private image pulls from ghcr.io will fail."
fi

TMP_SDL=$(mktemp --suffix=.yml)
TMP_DEPLOY=$(mktemp --suffix=.json)
export TMP_SDL TMP_DEPLOY SDL_FILE FHE_TIER

trap 'rm -f "${TMP_SDL}" "${TMP_DEPLOY}"' EXIT

# Select the requested tier and substitute env vars in the SDL
python3 - <<'PY'
import os
import re
from pathlib import Path

sdl_file = os.environ['SDL_FILE']
fhe_tier = os.environ['FHE_TIER']
ghcr_token = os.environ.get('GHCR_TOKEN', '')
ghcr_username = os.environ.get('GHCR_USERNAME', 'localchimera')
fhe_model_name = os.environ.get('FHE_MODEL_NAME', 'lfm2.5-230m')
tmp_sdl = os.environ['TMP_SDL']

src = Path(sdl_file).read_text()
sdl = re.sub(
    r'(deployment:\n\s+fhe-inference:\n\s+akash:\n\s+profile:) [\w-]+',
    r'\1 ' + fhe_tier,
    src,
)
if ghcr_token:
    sdl = sdl.replace('${GHCR_USERNAME}', ghcr_username)
    sdl = sdl.replace('${GHCR_TOKEN}', ghcr_token)
else:
    # Remove credentials block if no token provided (e.g., public image)
    sdl = re.sub(r'\n    credentials:\n      host:.*\n      username:.*\n      password:.*', '', sdl)
sdl = sdl.replace('${FHE_MODEL_NAME:-lfm2.5-230m}', fhe_model_name)
Path(tmp_sdl).write_text(sdl)
print(f"SDL profile set to {fhe_tier}")
PY

# Build the JSON deployment body with the SDL as a YAML string
python3 - <<PY
import json
from pathlib import Path

sdl = Path("${TMP_SDL}").read_text()
body = {"data": {"sdl": sdl, "deposit": float("${DEPOSIT_USD}")}}
Path("${TMP_DEPLOY}").write_text(json.dumps(body))
print(f"Deployment body written to ${TMP_DEPLOY}")
PY

echo "Creating deployment..."
CREATE_RESPONSE=$(curl -s -X POST "${CONSOLE_API}/v1/deployments" \
    -H "x-api-key: ${AKASH_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "@${TMP_DEPLOY}")

echo "Create response:"
echo "${CREATE_RESPONSE}" | python3 -m json.tool

DSEQ=$(echo "${CREATE_RESPONSE}" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['dseq'])")
MANIFEST=$(echo "${CREATE_RESPONSE}" | python3 -c "import sys, json; print(json.load(sys.stdin)['data']['manifest'])")

echo ""
echo "Deployment dseq: ${DSEQ}"
echo "Waiting 45 seconds for provider bids..."
sleep 45

echo ""
echo "Fetching bids..."
BIDS_RESPONSE=$(curl -s "${CONSOLE_API}/v1/bids?dseq=${DSEQ}" \
    -H "x-api-key: ${AKASH_API_KEY}")

echo "Bids response:"
echo "${BIDS_RESPONSE}" | python3 -m json.tool

# Accept the first bid
BID=$(echo "${BIDS_RESPONSE}" | python3 -c "import sys, json; print(json.dumps(json.load(sys.stdin)['data'][0]['bid']['id']))")
GSEQ=$(echo "${BID}" | python3 -c "import sys, json; print(json.load(sys.stdin)['gseq'])")
OSEQ=$(echo "${BID}" | python3 -c "import sys, json; print(json.load(sys.stdin)['oseq'])")
PROVIDER=$(echo "${BID}" | python3 -c "import sys, json; print(json.load(sys.stdin)['provider'])")

echo ""
echo "Accepting bid from provider ${PROVIDER}..."
LEASE_BODY=$(python3 -c "
import json
manifest = '''${MANIFEST}'''
body = {
    'manifest': manifest,
    'leases': [{'dseq': '${DSEQ}', 'gseq': ${GSEQ}, 'oseq': ${OSEQ}, 'provider': '${PROVIDER}'}]
}
print(json.dumps(body))
")

curl -s -X POST "${CONSOLE_API}/v1/leases" \
    -H "x-api-key: ${AKASH_API_KEY}" \
    -H "Content-Type: application/json" \
    -d "${LEASE_BODY}"

echo ""
echo ""
echo "Deployment submitted. Checking status..."
sleep 10

curl -s "${CONSOLE_API}/v1/deployments/${DSEQ}" \
    -H "x-api-key: ${AKASH_API_KEY}" | python3 -m json.tool

echo ""
echo "To close the deployment and recover remaining funds:"
echo "  curl -s -X DELETE ${CONSOLE_API}/v1/deployments/${DSEQ} -H 'x-api-key: ${AKASH_API_KEY}'"
