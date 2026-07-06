# Compile LFM2.5-230M FHE artifacts on Kaggle GPU (for Akash)

Use this workflow to compile the FHE inference circuits for **GPU** on a free Kaggle T4 notebook, then deploy the resulting artifacts on Akash.

## Why Kaggle?

Zama's GPU-enabled `concrete-python` wheel for version 2.10.0 is only published for Python 3.11 and requires a live GPU at compile time. Kaggle provides free T4 GPUs and Python 3.11, so it is the fastest no-cost path to generate GPU-compatible `server.zip` artifacts.

## Files

- `compile_lfm2_gpu_kaggle.ipynb` — Kaggle notebook (self-contained).
- `infra/akash-fhe/Dockerfile` — Docker image that supports both single-model and two-phase layouts.
- `infra/akash-fhe/server.py` — FastAPI server that loads either `server.zip` or `phase1/server.zip` + `phase2/server.zip`.

## Steps

1. **Open Kaggle** and create a new notebook.
2. **Upload** `compile_lfm2_gpu_kaggle.ipynb` (File → Upload Notebook).
3. **Enable GPU**: Runtime → Change runtime type → GPU T4.
4. **Run all cells**.
5. **Download** `artifacts.zip` from the output panel.
6. **Extract locally**:
   ```bash
   unzip artifacts.zip -d lfm2_fhe_artifacts
   ```
7. **Place artifacts into the Akash build context**:
   ```bash
   mkdir -p infra/akash-fhe/server_files/phase1
   mkdir -p infra/akash-fhe/server_files/phase2
   cp lfm2_fhe_artifacts/lfm2_fhe_phase1/server.zip infra/akash-fhe/server_files/phase1/server.zip
   cp lfm2_fhe_artifacts/lfm2_fhe_phase2/server.zip infra/akash-fhe/server_files/phase2/server.zip
   ```
8. **Build and push the GPU image**:
   ```bash
   cd infra/akash-fhe
   docker build -t ghcr.io/localchimera/fhe-inference:gpu .
   docker push ghcr.io/localchimera/fhe-inference:gpu
   ```
9. **Deploy on Akash** using the GPU tier (`fhe-rtx4090`, `fhe-a100`, or `fhe-h100`).

## Akash deployment notes

- The `Dockerfile` uses the CUDA 11.8 runtime base because the GPU `concrete-python` wheel bundles `libcudart.so.11.8`.
- `server.py` detects the two-phase layout automatically and exposes a `phase` field in `/run` and `/run_raw`.
- The `/health` endpoint returns `available_phases` so the client can confirm both phases are loaded.

## Expected output layout

```
infra/akash-fhe/server_files/
├── phase1/
│   └── server.zip
└── phase2/
    └── server.zip
```
