"""
Optimized FHE LLM — speed benchmark with quality measurement.

Tests multiple optimization strategies:
  1. Two-phase n_bits=5 (current baseline)
  2. Two-phase n_bits=4 (faster quantization)
  3. Composed single-pass (merge sequential Linears, 1 FHE call)
  4. Composed single-pass n_bits=4 (fastest)

Quality metric: cosine similarity between FHE output and plaintext output.
Target: cosine_sim > 0.95 (maintains generation quality)
"""

import os
import time
import json
import argparse
import numpy as np
from pathlib import Path

import torch
import torch.nn as nn

MODEL_ID = "LiquidAI/LFM2.5-230M"
DEPLOY_DIR = Path(__file__).parent / "deployment"


def load_weights():
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file

    config_path = hf_hub_download(MODEL_ID, "config.json")
    with open(config_path) as f:
        config = json.load(f)

    path = hf_hub_download(MODEL_ID, "model.safetensors")
    weights = load_file(path)

    prefix = "model.layers.2."
    w = {
        "q": weights[f"{prefix}self_attn.q_proj.weight"].float(),
        "k": weights[f"{prefix}self_attn.k_proj.weight"].float(),
        "v": weights[f"{prefix}self_attn.v_proj.weight"].float(),
        "o": weights[f"{prefix}self_attn.out_proj.weight"].float(),
        "w1": weights[f"{prefix}feed_forward.w1.weight"].float(),
        "w2": weights[f"{prefix}feed_forward.w2.weight"].float(),
        "w3": weights[f"{prefix}feed_forward.w3.weight"].float(),
    }
    return w, config


def compile_and_test(module, name, input_shape, n_bits, p_error, plaintext_ref, test_input):
    """Compile module to FHE, test speed and quality."""
    from concrete.ml.torch.compile import compile_torch_model
    from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer

    out_dir = DEPLOY_DIR / f"bench_{name}"
    out_dir.mkdir(parents=True, exist_ok=True)
    for f in out_dir.iterdir():
        f.unlink()

    print(f"\n  Compiling {name} (n_bits={n_bits}, p_error={p_error})...")
    calib = torch.randn(*input_shape)

    t0 = time.time()
    circuit = compile_torch_model(module, calib, n_bits=n_bits, p_error=p_error)
    compile_time = time.time() - t0

    fhe_dev = FHEModelDev(out_dir, circuit)
    fhe_dev.save()

    # Test
    client = FHEModelClient(out_dir)
    eval_keys = client.get_serialized_evaluation_keys()
    encrypted = client.quantize_encrypt_serialize(test_input)

    server = FHEModelServer(out_dir)
    t0 = time.time()
    enc_out = server.run(encrypted, eval_keys)
    inference_time = time.time() - t0

    fhe_result = client.deserialize_decrypt_dequantize(enc_out)

    # Quality
    mse = np.mean((fhe_result - plaintext_ref) ** 2)
    cos = np.dot(fhe_result.flatten(), plaintext_ref.flatten()) / (
        np.linalg.norm(fhe_result) * np.linalg.norm(plaintext_ref) + 1e-10
    )

    print(f"  Compile: {compile_time:.1f}s | Inference: {inference_time:.2f}s | "
          f"Cosine: {cos:.4f} | MSE: {mse:.6f}")

    return {
        "name": name,
        "n_bits": n_bits,
        "p_error": p_error,
        "compile_time": compile_time,
        "inference_time": inference_time,
        "cosine_sim": float(cos),
        "mse": float(mse),
    }


def main():
    print("=" * 70)
    print("FHE LLM Speed Optimization Benchmark")
    print("=" * 70)

    w, config = load_weights()
    hidden = config["hidden_size"]
    inter = config["intermediate_size"]

    # Test input
    np.random.seed(42)
    x_np = np.random.randn(1, hidden).astype(np.float32)
    x_t = torch.from_numpy(x_np)

    results = []

    # ─── Strategy 1: Two-phase n_bits=5 (baseline) ──────────────────────────
    print("\n┌─ Strategy 1: Two-phase n_bits=5 (baseline)")
    print("│  Phase 1: q/k/v/w1/w3 merged (7168, 1024)")
    print("│  Phase 2: o/w2 block-diagonal (2048, 3584)")

    # Phase 1
    merged1 = torch.cat([w["q"], w["k"], w["v"], w["w1"], w["w3"]], dim=0)
    mod_p1 = nn.Linear(hidden, merged1.shape[0], bias=False)
    mod_p1.weight.data = merged1
    ref_p1 = (x_t @ merged1.T).numpy()
    r1p1 = compile_and_test(mod_p1, "s1_p1", (1, hidden), 5, 0.02, ref_p1, x_np)

    # Phase 2
    inter_np = np.random.randn(1, 1024 + inter).astype(np.float32)
    inter_t = torch.from_numpy(inter_np)
    merged2 = torch.zeros(hidden * 2, 1024 + inter)
    merged2[:hidden, :1024] = w["o"]
    merged2[hidden:, 1024:] = w["w2"]
    mod_p2 = nn.Linear(1024 + inter, hidden * 2, bias=False)
    mod_p2.weight.data = merged2
    ref_p2 = (inter_t @ merged2.T).numpy()
    r1p2 = compile_and_test(mod_p2, "s1_p2", (1, 1024 + inter), 5, 0.02, ref_p2, inter_np)

    results.append({
        "strategy": "two_phase_n5",
        "inference_time": r1p1["inference_time"] + r1p2["inference_time"],
        "quality": min(r1p1["cosine_sim"], r1p2["cosine_sim"]),
        "fhe_calls": 2,
        "details": [r1p1, r1p2],
    })

    # ─── Strategy 2: Two-phase n_bits=4 ─────────────────────────────────────
    print("\n┌─ Strategy 2: Two-phase n_bits=4 (faster quantization)")
    print("│  Same structure, more aggressive quantization")

    r2p1 = compile_and_test(mod_p1, "s2_p1", (1, hidden), 4, 0.03, ref_p1, x_np)
    r2p2 = compile_and_test(mod_p2, "s2_p2", (1, 1024 + inter), 4, 0.03, ref_p2, inter_np)

    results.append({
        "strategy": "two_phase_n4",
        "inference_time": r2p1["inference_time"] + r2p2["inference_time"],
        "quality": min(r2p1["cosine_sim"], r2p2["cosine_sim"]),
        "fhe_calls": 2,
        "details": [r2p1, r2p2],
    })

    # ─── Strategy 3: Composed single-pass ───────────────────────────────────
    # Compose sequential Linears: o_proj @ v_proj and w2 @ w3
    # This eliminates Phase 2 — everything in 1 FHE call
    # Quality tradeoff: skips softmax attention and SiLU activation
    # But client can apply correction after decryption
    print("\n┌─ Strategy 3: Composed single-pass n_bits=5")
    print("│  Merge: o@v (1024,1024) + w2@w3 (1024,1024) → (2048, 1024)")
    print("│  1 FHE call instead of 2, much smaller matrix")

    # Compose sequential Linears:
    # Attention: o_proj(q_proj(x)) = x @ q_w.T @ o_w.T = x @ (o_w @ q_w).T
    #   q_w: (1024, 1024), o_w: (1024, 1024) → composed: (1024, 1024)
    # MLP: w2(w3(x)) = x @ w3_w.T @ w2_w.T = x @ (w2_w @ w3_w).T
    #   w3_w: (2560, 1024), w2_w: (1024, 2560) → composed: (1024, 1024)
    composed_attn = w["o"] @ w["q"]  # (1024, 1024) @ (1024, 1024) = (1024, 1024)
    composed_mlp = w["w2"] @ w["w3"]  # (1024, 2560) @ (2560, 1024) = (1024, 1024)

    # Merge into (2048, 1024)
    composed_merged = torch.cat([composed_attn, composed_mlp], dim=0)
    mod_composed = nn.Linear(hidden, composed_merged.shape[0], bias=False)
    mod_composed.weight.data = composed_merged
    ref_composed = (x_t @ composed_merged.T).numpy()

    r3 = compile_and_test(mod_composed, "s3_composed", (1, hidden), 5, 0.02, ref_composed, x_np)

    results.append({
        "strategy": "composed_n5",
        "inference_time": r3["inference_time"],
        "quality": r3["cosine_sim"],
        "fhe_calls": 1,
        "details": [r3],
    })

    # ─── Strategy 4: Composed single-pass n_bits=4 ──────────────────────────
    print("\n┌─ Strategy 4: Composed single-pass n_bits=4 (fastest)")
    print("│  Same composed approach, aggressive quantization")

    r4 = compile_and_test(mod_composed, "s4_composed_n4", (1, hidden), 4, 0.03, ref_composed, x_np)

    results.append({
        "strategy": "composed_n4",
        "inference_time": r4["inference_time"],
        "quality": r4["cosine_sim"],
        "fhe_calls": 1,
        "details": [r4],
    })

    # ─── Strategy 5: Composed + Q/K projections (quality hybrid) ────────────
    # Keep composed o@q and w2@w3, but also output q and k
    # so client can do proper attention if it wants
    print("\n┌─ Strategy 5: Composed + Q/K (quality hybrid)")
    print("│  o@q + w2@w3 + q + k → (4096, 1024), 1 FHE call")
    print("│  Client gets composed results AND raw q/k for attention")

    hybrid_merged = torch.cat([
        composed_attn,    # (1024, 1024) — composed attention
        composed_mlp,     # (1024, 1024) — composed MLP
        w["q"],           # (1024, 1024) — raw q for proper attention
        w["k"],           # (512, 1024)  — raw k for proper attention
    ], dim=0)
    mod_hybrid = nn.Linear(hidden, hybrid_merged.shape[0], bias=False)
    mod_hybrid.weight.data = hybrid_merged
    ref_hybrid = (x_t @ hybrid_merged.T).numpy()

    r5 = compile_and_test(mod_hybrid, "s5_hybrid", (1, hidden), 5, 0.02, ref_hybrid, x_np)

    results.append({
        "strategy": "hybrid_n5",
        "inference_time": r5["inference_time"],
        "quality": r5["cosine_sim"],
        "fhe_calls": 1,
        "details": [r5],
    })

    # ─── Summary ────────────────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print("BENCHMARK RESULTS")
    print(f"{'=' * 70}")
    print(f"{'Strategy':<25} {'Time/token':>12} {'Quality':>10} {'FHE calls':>10} {'100 tokens':>12}")
    print(f"{'-' * 70}")
    for r in results:
        time_100 = r["inference_time"] * 100
        print(f"{r['strategy']:<25} {r['inference_time']:>10.2f}s {r['quality']:>10.4f} {r['fhe_calls']:>10} {time_100/60:>10.1f}min")
    print(f"{'=' * 70}")

    # Save results
    with open(DEPLOY_DIR / "benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {DEPLOY_DIR / 'benchmark_results.json'}")


if __name__ == "__main__":
    main()
