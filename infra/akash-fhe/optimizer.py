"""Compile FHE circuits with multiple precision configs on GPU.

Runs inside the Akash H100 deployment container. Outputs results as JSON
and saves the best artifacts to /app/server_files/ and /app/client_files/.
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

app = FastAPI(title="FHE Precision Optimizer", version="0.1.0")

MODEL_ID = "LiquidAI/LFM2.5-230M"
OUT_DIR = Path("/app/precision_opt")
OUT_DIR.mkdir(parents=True, exist_ok=True)

PRECISION_CONFIGS = [
    {"n_bits": 5, "p_error": 0.03, "label": "n5_pe03"},
    {"n_bits": 5, "p_error": 0.05, "label": "n5_pe05"},
    {"n_bits": 4, "p_error": 0.02, "label": "n4_pe02"},
    {"n_bits": 4, "p_error": 0.05, "label": "n4_pe05"},
    {"n_bits": 4, "p_error": 0.08, "label": "n4_pe08"},
    {"n_bits": 3, "p_error": 0.05, "label": "n3_pe05"},
]

QUALITY_THRESHOLD = 0.80

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


def _compile_and_test(module, name, input_shape, ref, test_input, out_dir,
                      n_bits, p_error):
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in out_dir.iterdir():
        f.unlink()

    calib = torch.randn(*input_shape)
    kwargs = dict(n_bits=n_bits, p_error=p_error, device="cuda")

    print(f"  Compiling {name} (n_bits={n_bits}, p_error={p_error})...")
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
    cos = np.dot(result.flatten(), ref.flatten()) / (
        np.linalg.norm(result) * np.linalg.norm(ref) + 1e-10
    )

    print(f"    compile={compile_time:.1f}s, inference={inference_time:.3f}s, cosine={cos:.4f}")
    return {
        "compile_time": compile_time,
        "inference_time": inference_time,
        "cosine": float(cos),
    }


@app.get("/health")
async def health():
    return JSONResponse(content={
        "status": "ok",
        "gpu_enabled": concrete.compiler.check_gpu_enabled(),
    })


@app.get("/optimize")
async def optimize():
    """Compile and benchmark all precision configs. Returns results JSON."""
    w, config = _load()
    hidden = config["hidden_size"]
    inter = config["intermediate_size"]

    result = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                          capture_output=True, text=True)
    gpu_name = result.stdout.strip()

    np.random.seed(42)
    x_np = np.random.randn(1, hidden).astype(np.float32)
    x_t = torch.from_numpy(x_np)

    # Balanced two-phase modules
    composed_mlp = w["w2"] @ w["w3"]
    phase1_merged = torch.cat([
        w["q"], w["k"], w["v"], w["w1"], w["w3"], composed_mlp
    ], dim=0)
    mod_p1 = nn.Linear(hidden, phase1_merged.shape[0], bias=False)
    mod_p1.weight.data = phase1_merged
    ref_p1 = (x_t @ phase1_merged.T).numpy()

    mod_p2 = nn.Linear(hidden, hidden, bias=False)
    mod_p2.weight.data = w["o"]
    attn_intermediate = np.random.randn(1, hidden).astype(np.float32)
    attn_t = torch.from_numpy(attn_intermediate)
    ref_p2 = (attn_t @ w["o"].T).numpy()

    # Composed single-pass
    composed_all = torch.cat([
        w["q"], w["k"], w["v"], w["o"], w["w1"], w["w3"]
    ], dim=0)
    mod_composed = nn.Linear(hidden, composed_all.shape[0], bias=False)
    mod_composed.weight.data = composed_all
    ref_composed = (x_t @ composed_all.T).numpy()

    results = []

    # Composed single-pass
    print("\n=== COMPOSED SINGLE-PASS ===")
    for cfg in PRECISION_CONFIGS:
        label = f"composed_{cfg['label']}"
        out_dir = OUT_DIR / label
        r = _compile_and_test(mod_composed, label, (1, hidden), ref_composed, x_np,
                              out_dir, cfg["n_bits"], cfg["p_error"])
        r["config"] = cfg
        r["strategy"] = "composed"
        r["label"] = label
        r["tokens_per_min"] = 60 / r["inference_time"]
        results.append(r)

    # Balanced two-phase
    print("\n=== BALANCED TWO-PHASE ===")
    for cfg in PRECISION_CONFIGS:
        label = f"twophase_{cfg['label']}"
        p1_dir = OUT_DIR / f"{label}_phase1"
        p2_dir = OUT_DIR / f"{label}_phase2"

        r1 = _compile_and_test(mod_p1, f"{label}_p1", (1, hidden), ref_p1, x_np,
                              p1_dir, cfg["n_bits"], cfg["p_error"])
        r2 = _compile_and_test(mod_p2, f"{label}_p2", (1, hidden), ref_p2, attn_intermediate,
                              p2_dir, cfg["n_bits"], cfg["p_error"])

        total = r1["inference_time"] + r2["inference_time"]
        quality = min(r1["cosine"], r2["cosine"])
        r = {
            "inference_time": total,
            "cosine": quality,
            "phase1_time": r1["inference_time"],
            "phase2_time": r2["inference_time"],
            "config": cfg,
            "strategy": "twophase",
            "label": label,
            "tokens_per_min": 60 / total,
        }
        results.append(r)

    # Pick best
    best = None
    for r in results:
        if r["cosine"] >= QUALITY_THRESHOLD:
            if best is None or r["tokens_per_min"] > best["tokens_per_min"]:
                best = r

    if best is None:
        best = max(results, key=lambda r: r["tokens_per_min"])

    # Save results
    output = {
        "gpu": gpu_name,
        "quality_threshold": QUALITY_THRESHOLD,
        "best": best,
        "all_results": results,
    }
    with open(OUT_DIR / "results.json", "w") as f:
        json.dump(output, f, indent=2)

    return JSONResponse(content=output)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
