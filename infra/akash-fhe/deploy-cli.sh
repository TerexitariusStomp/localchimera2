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
AKASH_KEYRING_BACKEND="${AKASH_KEYRING_BACKEND:-test}"

# Deployment deposit and denomination. Akash mainnet now requires ACT (uact)
# for new deployments; uakt deposits are only accepted for existing deployments.
AKASH_DEPOSIT="${AKASH_DEPOSIT:-10000000uact}"

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
if ! akash keys show "${AKASH_KEY_NAME}" --keyring-backend "${AKASH_KEYRING_BACKEND}" >/dev/null 2>&1; then
    if [ -n "${AKASH_PRIVATE_KEY:-}" ]; then
        echo "Importing key '${AKASH_KEY_NAME}' from AKASH_PRIVATE_KEY..."
        python3 - <<PY
import hashlib
import json
import os
import base64
from ecdsa import SigningKey, SECP256k1
import bech32

priv_bytes = bytes.fromhex(os.environ['AKASH_PRIVATE_KEY'])
sk = SigningKey.from_string(priv_bytes, curve=SECP256k1)
vk = sk.get_verifying_key()
pub_bytes = vk.to_string("compressed")
sha = hashlib.sha256(pub_bytes).digest()
ripe = hashlib.new("ripemd160", sha).digest()
address = bech32.bech32_encode("akash", bech32.convertbits(ripe, 8, 5))
keyring = {
    "name": os.environ['AKASH_KEY_NAME'],
    "type": "local",
    "address": address,
    "pubkey": {"type": "tendermint/PubKeySecp256k1", "value": base64.b64encode(pub_bytes).decode()},
    "privkey": {"type": "tendermint/PrivKeySecp256k1", "value": base64.b64encode(priv_bytes).decode()},
}
keyring_dir = os.path.expanduser("~/.akash/keyring-test")
os.makedirs(keyring_dir, exist_ok=True)
keyring_path = os.path.join(keyring_dir, f"{os.environ['AKASH_KEY_NAME']}.json")
with open(keyring_path, "w") as f:
    json.dump(keyring, f)
os.chmod(keyring_path, 0o600)
print(f"Imported {os.environ['AKASH_KEY_NAME']} -> {address}")
PY
    else
        echo "Wallet '${AKASH_KEY_NAME}' not found. Create or import it first:"
        echo "  akash keys add ${AKASH_KEY_NAME}          # create new wallet"
        echo "  akash keys add ${AKASH_KEY_NAME} --recover # restore from mnemonic"
        echo "  AKASH_PRIVATE_KEY=... ./deploy-cli.sh     # import raw hex private key"
        exit 1
    fi
fi

OWNER=$(akash keys show "${AKASH_KEY_NAME}" -a --keyring-backend "${AKASH_KEYRING_BACKEND}")
echo "Owner address: ${OWNER}"

BALANCE=$(akash query bank balances "${OWNER}" --node "${AKASH_NODE}" --output json 2>/dev/null | python3 -c "import sys, json; d=json.load(sys.stdin); b=d.get('balances',[]); print(', '.join(f'{x[\"amount\"]}{x[\"denom\"]}' for x in b))" || echo "unknown")
echo "Balance: ${BALANCE}"

# Ensure the wallet has enough ACT (uact) for the deposit. If not, attempt to
# mint ACT by burning AKT via the BME module. This requires the wallet to have
# enough AKT and the mint output to meet the on-chain minimum (currently 10 ACT).
UACT_BALANCE=$(akash query bank balances "${OWNER}" --node "${AKASH_NODE}" --output json 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
for x in d.get('balances', []):
    if x['denom'] == 'uact':
        print(x['amount'])
        break
else:
    print('0')
")
DEPOSIT_AMOUNT=$(echo "${AKASH_DEPOSIT}" | python3 -c "import sys, re; print(re.match(r'(\\d+)', sys.stdin.read()).group(1))")

if [ "${UACT_BALANCE}" -lt "${DEPOSIT_AMOUNT}" ]; then
    echo ""
    echo "Insufficient uact balance (${UACT_BALANCE} < ${DEPOSIT_AMOUNT})."
    echo "Attempting to mint ACT by burning AKT..."
    # Estimate the AKT needed to mint the required ACT. The swap rate is
    # oracle-driven; the safety factor below tries to account for spread.
    MISSING_ACT=$((DEPOSIT_AMOUNT - UACT_BALANCE))
    # Try to burn roughly 2x the missing ACT value in AKT as a safety margin.
    BURN_UAKT=$((MISSING_ACT * 2))
    if [ "${BURN_UAKT}" -lt "10000000" ]; then
        BURN_UAKT=10000000
    fi
    akash tx bme mint-act "${BURN_UAKT}uakt" \
        --from "${AKASH_KEY_NAME}" \
        --keyring-backend "${AKASH_KEYRING_BACKEND}" \
        --node "${AKASH_NODE}" \
        --chain-id "${AKASH_CHAIN_ID}" \
        --gas-prices "${AKASH_GAS_PRICES}" \
        --gas auto \
        --gas-adjustment "${AKASH_GAS_ADJUSTMENT}" \
        -y
    echo "Waiting for BME ledger record to settle..."
    sleep 20
    UACT_BALANCE=$(akash query bank balances "${OWNER}" --node "${AKASH_NODE}" --output json 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
for x in d.get('balances', []):
    if x['denom'] == 'uact':
        print(x['amount'])
        break
else:
    print('0')
")
    if [ "${UACT_BALANCE}" -lt "${DEPOSIT_AMOUNT}" ]; then
        echo "ERROR: still not enough uact after mint attempt."
        echo "Balance: $(akash query bank balances "${OWNER}" --node "${AKASH_NODE}" --output json 2>/dev/null | python3 -c "import sys, json; d=json.load(sys.stdin); b=d.get('balances',[]); print(', '.join(f'{x[\"amount\"]}{x[\"denom\"]}' for x in b))")"
        echo "Fund the wallet with more AKT and retry."
        exit 1
    fi
fi

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
image_owner = os.environ.get('IMAGE_OWNER', ghcr_username)
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
    sdl = sdl.replace('${IMAGE_OWNER}', image_owner)
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
    --keyring-backend "${AKASH_KEYRING_BACKEND}" \
    --deposit "${AKASH_DEPOSIT}" \
    --node "${AKASH_NODE}" \
    --chain-id "${AKASH_CHAIN_ID}" \
    --gas-prices "${AKASH_GAS_PRICES}" \
    --gas auto \
    --gas-adjustment "${AKASH_GAS_ADJUSTMENT}" \
    -y \
    --output json)

echo "${CREATE_TX}" | python3 -m json.tool

DSEQ=$(echo "${CREATE_TX}" | python3 -c "
import sys, json
d = json.load(sys.stdin)
for event in d.get('events', []):
    if event.get('type') == 'akash.deployment.v1.EventDeploymentCreated':
        for attr in event.get('attributes', []):
            if attr.get('key') == 'id':
                print(json.loads(attr['value'])['dseq'])
                break
")

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
from decimal import Decimal

d = json.load(sys.stdin)
bids = d.get('bids', [])
bids.sort(key=lambda x: Decimal(x['bid']['price']['amount']))
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
CHEAPEST_BID=$(echo "${SORTED_BIDS}" | python3 -c "import sys, json; d=json.load(sys.stdin); print(json.dumps(d['bids'][0]['bid']['id']))")
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
    --keyring-backend "${AKASH_KEYRING_BACKEND}" \
    --node "${AKASH_NODE}" \
    --chain-id "${AKASH_CHAIN_ID}" \
    --gas-prices "${AKASH_GAS_PRICES}" \
    --gas auto \
    --gas-adjustment "${AKASH_GAS_ADJUSTMENT}" \
    -y

echo ""
echo "Sending manifest to provider..."
if ! command -v provider-services >/dev/null 2>&1; then
    echo "ERROR: provider-services binary not found. Install it from https://github.com/akash-network/provider/releases"
    echo "Example: curl -L -o provider-services.zip https://github.com/akash-network/provider/releases/download/v0.14.2/provider-services_linux_amd64.zip"
    exit 1
fi

provider-services send-manifest "${TMP_SDL}" \
    --dseq "${DSEQ}" \
    --gseq "${GSEQ}" \
    --oseq "${OSEQ}" \
    --provider "${PROVIDER}" \
    --from "${AKASH_KEY_NAME}" \
    --keyring-backend "${AKASH_KEYRING_BACKEND}" \
    --node "${AKASH_NODE}"

echo ""
echo "Deployment complete."
echo "DSEQ: ${DSEQ}"
echo "Provider: ${PROVIDER}"
echo ""
echo "Check status:"
echo "  akash query deployment get --owner ${OWNER} --dseq ${DSEQ} --node ${AKASH_NODE}"
echo "  provider-services lease-status --dseq ${DSEQ} --gseq ${GSEQ} --oseq ${OSEQ} --provider ${PROVIDER} --from ${AKASH_KEY_NAME} --node ${AKASH_NODE}"
echo ""
echo "Close deployment:"
echo "  akash tx deployment close --owner ${OWNER} --dseq ${DSEQ} --from ${AKASH_KEY_NAME} --node ${AKASH_NODE} --chain-id ${AKASH_CHAIN_ID} -y"
