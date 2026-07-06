#!/usr/bin/env bash
set -euo pipefail

# Deploy FHE inference to Akash using the self-custody Akash CLI.
# Requires a funded AKT wallet and the `akash` binary.
#
# Usage:
#   export AKASH_KEY_NAME=mywallet
#   export FHE_TIER=fhe-rtx4090
#   ./deploy-cli.sh

AKASH_NODE="${AKASH_NODE:-https://rpc.akashnet.net:443}"
AKASH_CHAIN_ID="${AKASH_CHAIN_ID:-akashnet-2}"
AKASH_KEY_NAME="${AKASH_KEY_NAME:-fhe-deploy}"
AKASH_GAS_PRICES="${AKASH_GAS_PRICES:-0.025uakt}"
AKASH_GAS_ADJUSTMENT="${AKASH_GAS_ADJUSTMENT:-1.5}"

FHE_TIER="${FHE_TIER:-fhe-rtx4090}"
SDL_FILE="${SDL_FILE:-deploy.yml}"
GHCR_USERNAME="${GHCR_USERNAME:-localchimera}"
GHCR_TOKEN="${GHCR_TOKEN:-}"
FHE_MODEL_NAME="${FHE_MODEL_NAME:-lfm2.5-230m}"

echo "Deploying FHE inference to Akash via CLI"
echo "Chain: ${AKASH_CHAIN_ID}"
echo "Node:  ${AKASH_NODE}"
echo "Tier:  ${FHE_TIER}"
echo "Wallet: ${AKASH_KEY_NAME}"

if ! command -v akash >/dev/null 2>&1; then
    echo "ERROR: akash CLI not found. Install it from https://github.com/akash-network/node/releases"
    exit 1
fi

# Ensure wallet exists
if ! akash keys show "${AKASH_KEY_NAME}" >/dev/null 2>&1; then
    echo "Wallet '${AKASH_KEY_NAME}' not found. Create or import it first:"
    echo "  akash keys add ${AKASH_KEY_NAME}          # create new wallet"
    echo "  akash keys add ${AKASH_KEY_NAME} --recover # restore from mnemonic"
    exit 1
fi

OWNER=$(akash keys show "${AKASH_KEY_NAME}" -a)
echo "Owner address: ${OWNER}"

BALANCE=$(akash query bank balances "${OWNER}" --node "${AKASH_NODE}" --output json 2>/dev/null | python3 -c "import sys, json; d=json.load(sys.stdin); b=d.get('balances',[]); print(', '.join(f'{x[\"amount\"]}{x[\"denom\"]}' for x in b))" || echo "unknown")
echo "Balance: ${BALANCE}"

TMP_SDL=$(mktemp --suffix=.yml)
export TMP_SDL SDL_FILE FHE_TIER

trap 'rm -f "${TMP_SDL}"' EXIT

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
    # Remove credentials block if no token provided (public image)
    sdl = re.sub(r'\n    credentials:\n      host:.*\n      username:.*\n      password:.*', '', sdl)
sdl = sdl.replace('${FHE_MODEL_NAME:-lfm2.5-230m}', fhe_model_name)
Path(tmp_sdl).write_text(sdl)
print(f"SDL profile set to {fhe_tier}")
PY

echo ""
echo "Creating deployment on-chain..."
CREATE_TX=$(akash tx deployment create "${TMP_SDL}" \
    --from "${AKASH_KEY_NAME}" \
    --node "${AKASH_NODE}" \
    --chain-id "${AKASH_CHAIN_ID}" \
    --gas-prices "${AKASH_GAS_PRICES}" \
    --gas auto \
    --gas-adjustment "${AKASH_GAS_ADJUSTMENT}" \
    -y \
    --output json)

echo "${CREATE_TX}" | python3 -m json.tool

DSEQ=$(echo "${CREATE_TX}" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['logs'][0]['events'][0]['attributes'][0]['value'])")

echo ""
echo "Deployment dseq: ${DSEQ}"
echo "Waiting 60 seconds for provider bids..."
sleep 60

echo ""
echo "Fetching bids..."
BIDS=$(akash query market bid list \
    --owner "${OWNER}" \
    --dseq "${DSEQ}" \
    --node "${AKASH_NODE}" \
    --output json)

# Pretty-print bids sorted by price (cheapest first)
SORTED_BIDS=$(echo "${BIDS}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
bids = d.get('bids', [])
bids.sort(key=lambda x: int(x['bid']['price']['amount']))
d['bids'] = bids
print(json.dumps(d, indent=2))
")

echo "${SORTED_BIDS}"

BID_COUNT=$(echo "${SORTED_BIDS}" | python3 -c "import sys, json; print(len(json.load(sys.stdin).get('bids',[])))")
if [ "${BID_COUNT}" -eq 0 ]; then
    echo "ERROR: no bids received. You may need to raise pricing or check provider availability."
    exit 1
fi

echo ""
echo "Accepting the cheapest bid..."
CHEAPEST_BID=$(echo "${SORTED_BIDS}" | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d['bids'][0]['bid']['bid_id']))")
GSEQ=$(echo "${CHEAPEST_BID}" | python3 -c "import sys, json; print(json.load(sys.stdin)['gseq'])")
OSEQ=$(echo "${CHEAPEST_BID}" | python3 -c "import sys, json; print(json.load(sys.stdin)['oseq'])")
PROVIDER=$(echo "${CHEAPEST_BID}" | python3 -c "import sys, json; print(json.load(sys.stdin)['provider'])")
PRICE=$(echo "${SORTED_BIDS}" | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['bids'][0]['bid']['price']['amount'] + d['bids'][0]['bid']['price']['denom'])")

echo "Provider: ${PROVIDER} gseq=${GSEQ} oseq=${OSEQ} price=${PRICE}"

akash tx market lease create \
    --dseq "${DSEQ}" \
    --gseq "${GSEQ}" \
    --oseq "${OSEQ}" \
    --provider "${PROVIDER}" \
    --from "${AKASH_KEY_NAME}" \
    --node "${AKASH_NODE}" \
    --chain-id "${AKASH_CHAIN_ID}" \
    --gas-prices "${AKASH_GAS_PRICES}" \
    --gas auto \
    --gas-adjustment "${AKASH_GAS_ADJUSTMENT}" \
    -y

echo ""
echo "Sending manifest to provider..."
akash provider send-manifest "${TMP_SDL}" \
    --dseq "${DSEQ}" \
    --gseq "${GSEQ}" \
    --oseq "${OSEQ}" \
    --provider "${PROVIDER}" \
    --from "${AKASH_KEY_NAME}" \
    --node "${AKASH_NODE}" \
    -y

echo ""
echo "Deployment complete."
echo "DSEQ: ${DSEQ}"
echo "Provider: ${PROVIDER}"
echo ""
echo "Check status:"
echo "  akash query deployment get --owner ${OWNER} --dseq ${DSEQ} --node ${AKASH_NODE}"
echo "  akash provider lease-status --dseq ${DSEQ} --gseq ${GSEQ} --oseq ${OSEQ} --provider ${PROVIDER} --from ${AKASH_KEY_NAME} --node ${AKASH_NODE}"
echo ""
echo "Close deployment:"
echo "  akash tx deployment close --owner ${OWNER} --dseq ${DSEQ} --from ${AKASH_KEY_NAME} --node ${AKASH_NODE} --chain-id ${AKASH_CHAIN_ID} -y"
