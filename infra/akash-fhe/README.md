# Akash FHE Inference Deployment

Deploys an FHE inference server on Akash GPU providers. The server loads a
compiled Concrete circuit (`server.zip`) and exposes HTTP endpoints for encrypted
inference. The server never sees the client secret key.

## Architecture

```
Client (browser/SDK)
  ↓ encrypts input with secret key
Akash FHE inference pod
  ↓ receives encrypted input + evaluation keys
FHE Server (concrete-python 2.10.0 GPU)
  ↓ runs FHE circuit on GPU
  ↓ returns encrypted output
Client decrypts result
```

## Files

- `deploy.yml` — Akash SDL manifest with three GPU tiers: `fhe-h100`, `fhe-a100`, `fhe-rtx4090`.
- `Dockerfile` — CUDA 12.1 image with concrete-python 2.10.0 GPU and concrete-ml 1.9.0.
- `server.py` — FastAPI server that loads `server.zip` and runs encrypted inference.
- `build.sh` — Build and push the Docker image.
- `deploy.sh` — Deploy the selected tier to Akash.

## Build the image locally

```bash
export IMAGE_TAG=ghcr.io/localchimera/fhe-inference:latest
PUSH=true ./build.sh
```

## Build the image via GitHub Actions

If you don't have Docker installed locally, use the workflow at `.github/workflows/build-fhe-inference-image.yml`. It builds and pushes to GitHub Container Registry (GHCR) automatically on every push to `infra/akash-fhe/Dockerfile` or `server.py`.


## Deploy to Akash (CLI with wallet)

```bash
# Choose the tier that matches your model size
export FHE_TIER=fhe-h100   # 7B+ models
export FHE_TIER=fhe-a100   # 1B-7B models
export FHE_TIER=fhe-rtx4090 # small models (< 1B)

export AKASH_WALLET=mykey
export FHE_MODEL_NAME=lfm2.5-230m

./deploy.sh
```

## Deploy to Akash (Console Managed Wallet API — no AKT wallet needed)

If you have an Akash Console API key (e.g., `ac.sk.production.xxx`), you can deploy via the REST API without managing an AKT wallet or private key locally. The Console account is billed directly (USD deposit).

```bash
export AKASH_API_KEY=ac.sk.production.xxx
export FHE_TIER=fhe-rtx4090
export DEPOSIT_USD=10.0

./deploy-console.sh
```

The script will:
1. Create the deployment at `https://console-api.akash.network/v1/deployments`.
2. Wait for provider bids.
3. Accept the first bid.
4. Print the deployment status and a `curl` command to close it later.


## Prepare the server artifact

Before deployment, compile the model locally and produce `server.zip`:

```python
from pathlib import Path
from concrete.ml.torch.compile import compile_torch_model
from concrete.ml.deployment import FHEModelDev

# Compile your model as usual
circuit = compile_torch_model(model, example_input, n_bits=5, use_gpu=True)

# Save server + client artifacts
path_dir = Path("./serialized_fhe_model").resolve()
path_dir.mkdir(parents=True, exist_ok=True)
dev = FHEModelDev(path_dir, circuit)
dev.save(via_mlir=True)  # via_mlir is needed for cross-platform deployment
```

This produces:
- `serialized_fhe_model/server.zip` — deploy to the Akash pod at `/app/server_files/`.
- `serialized_fhe_model/client.zip` — distributed to clients so they can generate keys and encrypt inputs.

Upload `server.zip` to the pod via Akash persistent storage or a sidecar init
container.

## API endpoints

- `GET /health` — server status, GPU availability, model name.
- `POST /run` — run FHE inference on encrypted input.


## Important security notes

- The server only holds the **FHE circuit** and **evaluation keys**.
- The **client secret key** never leaves the client.
- The protocol's Akash wallet pays for compute; the server image contains no private keys.
