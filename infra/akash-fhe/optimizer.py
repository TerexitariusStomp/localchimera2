"""
FHE LLM Low-Rank Optimization — maximize speed while maintaining quality.

Strategy: SVD-decompose the merged weight matrix W (8192×1024) as W ≈ U @ V
where U is (8192×k) and V is (k×1024). FHE only computes V@x → k outputs.
Client multiplies by U in plaintext → full 8192 outputs.

This reduces the FHE circuit output from 8192 to k (e.g. 256-512),
potentially 10-30x faster inference while preserving quality via SVD.

Also tests composed single-pass with low-rank for maximum speed.
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

app = FastAPI(title="FHE Low-Rank Optimizer", version="0.1.0")

MODEL_ID = "LiquidAI/LFM2.5-230M"
OUT_DIR = Path("/app/lowrank_opt")
OUT_DIR.mkdir(parents=True, exist_ok=True)

RANK_CONFIGS = [128, 256, 384, 512, 768, 1024]
N_BITS = 5
P_ERROR = 0.03
QUALITY_THRESHOLD = 0.90

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
    w, config = _load()
    hidden = config["hidden_size"]
    inter = config["intermediate_size"]

    result = subprocess.run(["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                          capture_output=True, text=True)
    gpu_name = result.stdout.strip()

    np.random.seed(42)
    x_np = np.random.randn(1, hidden).astype(np.float32)
    x_t = torch.from_numpy(x_np)

    composed_all = torch.cat([
        w["q"], w["k"], w["v"], w["o"], w["w1"], w["w3"]
    ], dim=0)
    ref_full = (x_t @ composed_all.T).numpy()

    attn_merged = torch.cat([w["q"], w["k"], w["v"], w["o"]], dim=0)
    ref_attn = (x_t @ attn_merged.T).numpy()

    mlp_merged = torch.cat([w["w1"], w["w3"]], dim=0)
    ref_mlp = (x_t @ mlp_merged.T).numpy()

    results = []

    # Baseline: full composed
    print("\n=== BASELINE: Full composed (8192x1024) ===")
    mod_full = nn.Linear(hidden, composed_all.shape[0], bias=False)
    mod_full.weight.data = composed_all
    r = _compile_and_test(mod_full, "full_composed", (1, hidden), ref_full, x_np,
                          OUT_DIR / "full_composed", N_BITS, P_ERROR)
    r["label"] = "full_composed"
    r["strategy"] = "baseline"
    r["rank"] = hidden
    r["tokens_per_min"] = 60 / r["inference_time"]
    results.append(r)
    print(f"  {r['tokens_per_min']:.1f} tok/min, quality={r['cosine']:.4f}")

    # Low-rank composed
    print("\n=== LOW-RANK COMPOSED (single FHE call + plaintext U) ===")
    for k in RANK_CONFIGS:
        label = f"lowrank_{k}"
        U_k, V_k = _svd_decompose(composed_all, k)

        mod_lr = nn.Linear(hidden, k, bias=False)
        mod_lr.weight.data = V_k

        ref_lr = (x_t @ V_k.T).numpy()
        out_dir = OUT_DIR / label
        r = _compile_and_test(mod_lr, label, (1, hidden), ref_lr, x_np,
                              out_dir, N_BITS, P_ERROR)

        # Full quality reconstruction
        client = FHEModelClient(out_dir)
        eval_keys = client.get_serialized_evaluation_keys()
        encrypted = client.quantize_encrypt_serialize(x_np)
        server = FHEModelServer(out_dir)
        enc_out = server.run(encrypted, eval_keys)
        fhe_small = client.deserialize_decrypt_dequantize(enc_out)

        U_np = U_k.numpy()
        reconstructed = fhe_small @ U_np.T
        full_cos = np.dot(reconstructed.flatten(), ref_full.flatten()) / (
            np.linalg.norm(reconstructed) * np.linalg.norm(ref_full) + 1e-10
        )

        r["label"] = label
        r["strategy"] = "lowrank_composed"
        r["rank"] = k
        r["fhe_output_size"] = k
        r["full_cosine"] = float(full_cos)
        r["tokens_per_min"] = 60 / r["inference_time"]
        results.append(r)
        print(f"  k={k}: {r['tokens_per_min']:.1f} tok/min, fhe_cos={r['cosine']:.4f}, full_cos={full_cos:.4f}")

    # Low-rank split: attention + MLP separately
    print("\n=== LOW-RANK SPLIT (attn + mlp, parallel) ===")
    for k_attn in [128, 256, 512]:
        for k_mlp in [256, 512, 1024]:
            label = f"split_attn{k_attn}_mlp{k_mlp}"

            U_a, V_a = _svd_decompose(attn_merged, k_attn)
            U_m, V_m = _svd_decompose(mlp_merged, k_mlp)

            mod_a = nn.Linear(hidden, k_attn, bias=False)
            mod_a.weight.data = V_a
            mod_m = nn.Linear(hidden, k_mlp, bias=False)
            mod_m.weight.data = V_m

            ref_a = (x_t @ V_a.T).numpy()
            ref_m = (x_t @ V_m.T).numpy()

            dir_a = OUT_DIR / f"{label}_attn"
            dir_m = OUT_DIR / f"{label}_mlp"

            r_a = _compile_and_test(mod_a, f"{label}_attn", (1, hidden), ref_a, x_np,
                                    dir_a, N_BITS, P_ERROR)
            r_m = _compile_and_test(mod_m, f"{label}_mlp", (1, hidden), ref_m, x_np,
                                    dir_m, N_BITS, P_ERROR)

            # Quality reconstruction
            client_a = FHEModelClient(dir_a)
            client_m = FHEModelClient(dir_m)
            ek_a = client_a.get_serialized_evaluation_keys()
            ek_m = client_m.get_serialized_evaluation_keys()
            enc_a = client_a.quantize_encrypt_serialize(x_np)
            enc_m = client_m.quantize_encrypt_serialize(x_np)
            server_a = FHEModelServer(dir_a)
            server_m = FHEModelServer(dir_m)

            out_a = client_a.deserialize_decrypt_dequantize(server_a.run(enc_a, ek_a))
            out_m = client_m.deserialize_decrypt_dequantize(server_m.run(enc_m, ek_m))

            recon_attn = out_a @ U_a.numpy().T
            recon_mlp = out_m @ U_m.numpy().T
            recon_full = np.concatenate([recon_attn, recon_mlp], axis=1)

            full_cos = np.dot(recon_full.flatten(), ref_full.flatten()) / (
                np.linalg.norm(recon_full) * np.linalg.norm(ref_full) + 1e-10
            )

            parallel_time = max(r_a["inference_time"], r_m["inference_time"])
            sequential_time = r_a["inference_time"] + r_m["inference_time"]

            r = {
                "label": label,
                "strategy": "lowrank_split",
                "k_attn": k_attn,
                "k_mlp": k_mlp,
                "attn_time": r_a["inference_time"],
                "mlp_time": r_m["inference_time"],
                "parallel_time": parallel_time,
                "sequential_time": sequential_time,
                "inference_time": parallel_time,
                "full_cosine": float(full_cos),
                "tokens_per_min": 60 / parallel_time,
            }
            results.append(r)
            print(f"  attn={k_attn}, mlp={k_mlp}: {r['tokens_per_min']:.1f} tok/min (parallel), "
                  f"full_cos={full_cos:.4f}")

    # Pick best
    best = None
    for r in results:
        cos_key = "full_cosine" if "full_cosine" in r else "cosine"
        if r.get(cos_key, 0) >= QUALITY_THRESHOLD:
            if best is None or r["tokens_per_min"] > best["tokens_per_min"]:
                best = r

    if best is None:
        best = max(results, key=lambda r: r["tokens_per_min"])
        print(f"\n  WARNING: No config met quality threshold {QUALITY_THRESHOLD}")

    print("\n" + "=" * 70)
    print("ALL RESULTS (sorted by speed)")
    print("=" * 70)
    for r in sorted(results, key=lambda x: x["tokens_per_min"], reverse=True):
        cos_key = "full_cosine" if "full_cosine" in r else "cosine"
        marker = " *** BEST" if r is best else ""
        print(f"  {r['label']:>30s}: {r['tokens_per_min']:6.1f} tok/min, "
              f"quality={r.get(cos_key, 0):.4f}, time={r['inference_time']:.3f}s{marker}")
    print("=" * 70)
    cos_key = "full_cosine" if "full_cosine" in best else "cosine"
    print(f"BEST: {best['label']}, {best['tokens_per_min']:.1f} tok/min, "
          f"quality={best.get(cos_key, 0):.4f}")
    print("=" * 70)

    output = {
        "gpu": gpu_name,
        "n_bits": N_BITS,
        "p_error": P_ERROR,
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
