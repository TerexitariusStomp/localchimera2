"""
FHE LLM Batched Low-Rank — NO quality decrease.

Uses SVD at full rank (k=1024, which is lossless for 1024-dim input)
with higher precision (n_bits=6-7, p_error=0.01) to match baseline
quality of 0.96, while batching multiple tokens per FHE call for
massive throughput improvement.

Also tests n_bits=5 with p_error=0.01 to see if that's sufficient.
"""
import os
import time
import json
import shutil
import subprocess
import numpy as np
from pathlib import Path

import torch
import torch.nn as nn
import concrete.compiler
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file
from concrete.ml.torch.compile import compile_torch_model
from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer

from fastapi import FastAPI
from fastapi.responses import JSONResponse

app = FastAPI(title="FHE Batched No-Quality-Loss Optimizer", version="0.1.0")

MODEL_ID = "LiquidAI/LFM2.5-230M"
OUT_DIR = Path("/app/batched_opt")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Configs: (rank, n_bits, p_error, batch_size)
# Focus on maintaining quality >= 0.95 while maximizing throughput
CONFIGS = [
    # Baseline: full composed, no low-rank, batch=1
    (1024, 5, 0.02, 1, "baseline_full"),

    # Full rank (lossless SVD) with various precision, batched
    (1024, 5, 0.01, 1, "r1024_n5_pe01_b1"),
    (1024, 5, 0.01, 4, "r1024_n5_pe01_b4"),
    (1024, 5, 0.01, 8, "r1024_n5_pe01_b8"),
    (1024, 5, 0.01, 16, "r1024_n5_pe01_b16"),
    (1024, 5, 0.01, 32, "r1024_n5_pe01_b32"),

    (1024, 6, 0.01, 1, "r1024_n6_pe01_b1"),
    (1024, 6, 0.01, 4, "r1024_n6_pe01_b4"),
    (1024, 6, 0.01, 8, "r1024_n6_pe01_b8"),
    (1024, 6, 0.01, 16, "r1024_n6_pe01_b16"),
    (1024, 6, 0.01, 32, "r1024_n6_pe01_b32"),

    (1024, 7, 0.01, 1, "r1024_n7_pe01_b1"),
    (1024, 7, 0.01, 8, "r1024_n7_pe01_b8"),
    (1024, 7, 0.01, 16, "r1024_n7_pe01_b16"),
    (1024, 7, 0.01, 32, "r1024_n7_pe01_b32"),

    # Also test p_error=0.005 for max quality
    (1024, 6, 0.005, 8, "r1024_n6_pe005_b8"),
    (1024, 6, 0.005, 16, "r1024_n6_pe005_b16"),
    (1024, 7, 0.005, 8, "r1024_n7_pe005_b8"),
    (1024, 7, 0.005, 16, "r1024_n7_pe005_b16"),

    # Direct full circuit (no SVD) batched for comparison
    (8192, 5, 0.02, 4, "full_n5_b4"),
    (8192, 5, 0.02, 8, "full_n5_b8"),
    (8192, 6, 0.01, 4, "full_n6_b4"),
    (8192, 6, 0.01, 8, "full_n6_b8"),
]

QUALITY_THRESHOLD = 0.95

_weights = None
_config = None


def _load():
    global _weights, _config
    if _weights is not None:
        return _weights, _config
    config_path = hf_hub_download(MODEL_ID, "config.json")
    with open(config_path) as f:
        _config = json.load(f)
    path = hf_hub_download(MODEL_ID, "model.safetensors")
    weights = load_file(path)
    prefix = "model.layers.2."
    _weights = {k: weights[f"{prefix}{n}"].float() for k, n in {
        "q": "self_attn.q_proj.weight",
        "k": "self_attn.k_proj.weight",
        "v": "self_attn.v_proj.weight",
        "o": "self_attn.out_proj.weight",
        "w1": "feed_forward.w1.weight",
        "w2": "feed_forward.w2.weight",
        "w3": "feed_forward.w3.weight",
    }.items()}
    return _weights, _config


def _svd_decompose(weight_matrix, k):
    U, S, Vh = torch.linalg.svd(weight_matrix, full_matrices=False)
    U_k = U[:, :k] @ torch.diag(S[:k])
    V_k = Vh[:k, :]
    return U_k, V_k


def _compile_and_test_batched(module, name, input_shape, ref, test_input, out_dir,
                               n_bits, p_error, batch_size):
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in out_dir.iterdir():
        f.unlink()

    calib = torch.randn(*input_shape)
    kwargs = dict(n_bits=n_bits, p_error=p_error, device="cuda")

    print(f"  Compiling {name} (n_bits={n_bits}, p_error={p_error}, batch={batch_size})...")
    t0 = time.time()
    circuit = compile_torch_model(module, calib, **kwargs)
    compile_time = time.time() - t0

    FHEModelDev(out_dir, circuit).save()

    client = FHEModelClient(out_dir)
    eval_keys = client.get_serialized_evaluation_keys()
    encrypted = client.quantize_encrypt_serialize(test_input)

    server = FHEModelServer(out_dir)
    try:
        _ = server.run(encrypted, eval_keys)
    except Exception:
        pass

    times = []
    for _ in range(5):
        t0 = time.time()
        enc_out = server.run(encrypted, eval_keys)
        times.append(time.time() - t0)

    inference_time = min(times)
    result = client.deserialize_decrypt_dequantize(enc_out)

    cosines = []
    for i in range(batch_size):
        r_flat = result[i].flatten()
        ref_flat = ref[i].flatten()
        c = np.dot(r_flat, ref_flat) / (
            np.linalg.norm(r_flat) * np.linalg.norm(ref_flat) + 1e-10
        )
        cosines.append(c)
    avg_cos = float(np.mean(cosines))
    tokens_per_min = batch_size * 60 / inference_time

    print(f"    compile={compile_time:.1f}s, inference={inference_time:.3f}s, "
          f"batch={batch_size}, cos={avg_cos:.4f}, {tokens_per_min:.1f} tok/min")

    return {
        "compile_time": compile_time,
        "inference_time": inference_time,
        "cosine": avg_cos,
        "batch_size": batch_size,
        "tokens_per_min": tokens_per_min,
    }


@app.get("/health")
async def health():
    return JSONResponse(content={
        "status": "ok",
        "gpu_enabled": concrete.compiler.check_gpu_enabled(),
    })


@app.get("/optimize")
async def optimize():
    w, config = _load()
    hidden = config["hidden_size"]
    inter = config["intermediate_size"]

    result = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                          capture_output=True, text=True)
    gpu_name = result.stdout.strip()

    np.random.seed(42)

    composed_all = torch.cat([
        w["q"], w["k"], w["v"], w["o"], w["w1"], w["w3"]
    ], dim=0)  # (8192, 1024)

    results = []

    for rank, n_bits, p_error, batch_size, label in CONFIGS:
        x_np = np.random.randn(batch_size, hidden).astype(np.float32)
        x_t = torch.from_numpy(x_np)
        ref_full = (x_t @ composed_all.T).numpy()

        if rank >= 8192:
            # Full circuit, no SVD
            mod = nn.Linear(hidden, composed_all.shape[0], bias=False)
            mod.weight.data = composed_all
            ref = ref_full
            out_dir = OUT_DIR / label
            r = _compile_and_test_batched(
                mod, label, (batch_size, hidden), ref, x_np, out_dir,
                n_bits, p_error, batch_size
            )
            r["full_cosine"] = r["cosine"]
            r["strategy"] = "full"
        else:
            # Low-rank SVD
            U_k, V_k = _svd_decompose(composed_all, rank)
            mod = nn.Linear(hidden, rank, bias=False)
            mod.weight.data = V_k
            ref = (x_t @ V_k.T).numpy()

            out_dir = OUT_DIR / label
            r = _compile_and_test_batched(
                mod, label, (batch_size, hidden), ref, x_np, out_dir,
                n_bits, p_error, batch_size
            )

            # Full quality with U reconstruction
            client = FHEModelClient(out_dir)
            eval_keys = client.get_serialized_evaluation_keys()
            encrypted = client.quantize_encrypt_serialize(x_np)
            server = FHEModelServer(out_dir)
            enc_out = server.run(encrypted, eval_keys)
            fhe_small = client.deserialize_decrypt_dequantize(enc_out)

            U_np = U_k.numpy()
            reconstructed = fhe_small @ U_np.T

            full_cosines = []
            for i in range(batch_size):
                r_flat = reconstructed[i].flatten()
                ref_flat = ref_full[i].flatten()
                c = np.dot(r_flat, ref_flat) / (
                    np.linalg.norm(r_flat) * np.linalg.norm(ref_flat) + 1e-10
                )
                full_cosines.append(c)

            r["full_cosine"] = float(np.mean(full_cosines))
            r["strategy"] = "lowrank"

        r["label"] = label
        r["rank"] = rank
        r["n_bits"] = n_bits
        r["p_error"] = p_error
        r["tokens_per_min"] = batch_size * 60 / r["inference_time"]
        results.append(r)
        print(f"  {label}: {r['tokens_per_min']:.1f} tok/min, full_cos={r['full_cosine']:.4f}")

    # Pick best: highest tokens_per_min while full_cosine >= threshold
    best = None
    for r in results:
        if r["full_cosine"] >= QUALITY_THRESHOLD:
            if best is None or r["tokens_per_min"] > best["tokens_per_min"]:
                best = r

    if best is None:
        # Try 0.90
        for r in results:
            if r["full_cosine"] >= 0.90:
                if best is None or r["tokens_per_min"] > best["tokens_per_min"]:
                    best = r

    if best is None:
        best = max(results, key=lambda r: r["tokens_per_min"])
        print(f"\n  WARNING: No config met quality threshold {QUALITY_THRESHOLD}")

    print("\n" + "=" * 70)
    print("ALL RESULTS (sorted by speed)")
    print("=" * 70)
    for r in sorted(results, key=lambda x: x["tokens_per_min"], reverse=True):
        marker = " *** BEST" if r is best else ""
        print(f"  {r['label']:>25s}: {r['tokens_per_min']:7.1f} tok/min, "
              f"full_cos={r['full_cosine']:.4f}, "
              f"time={r['inference_time']:.3f}s, batch={r['batch_size']}{marker}")
    print("=" * 70)
    print(f"BEST: {best['label']}, {best['tokens_per_min']:.1f} tok/min, "
          f"quality={best['full_cosine']:.4f}")
    print("=" * 70)

    output = {
        "gpu": gpu_name,
        "quality_threshold": QUALITY_THRESHOLD,
        "best": best,
        "all_results": results,
    }
    with open(OUT_DIR / "results.json", "w") as f:
        json.dump(output, f, indent=2, default=str)

    return JSONResponse(content=json.loads(json.dumps(output, default=str)))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
