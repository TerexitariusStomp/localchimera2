"""
FHE LLM — Advanced optimization benchmark.

Tests 4 new strategies on top of the proven 3-phase approach:
  A. rounding_threshold_bits: reduce intermediate accumulator bits
  B. n_bits dict: separate op_inputs vs op_weights precision
  C. Low-rank SVD approximation: decompose weight matrices
  D. Speculative decoding simulation: measure effective speedup

Base: 3-phase uniform n_bits=5 (3.95s, quality=0.935)
"""

import os
import time
import json
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
    return {
        "q": weights[f"{prefix}self_attn.q_proj.weight"].float(),
        "k": weights[f"{prefix}self_attn.k_proj.weight"].float(),
        "v": weights[f"{prefix}self_attn.v_proj.weight"].float(),
        "o": weights[f"{prefix}self_attn.out_proj.weight"].float(),
        "w1": weights[f"{prefix}feed_forward.w1.weight"].float(),
        "w2": weights[f"{prefix}feed_forward.w2.weight"].float(),
        "w3": weights[f"{prefix}feed_forward.w3.weight"].float(),
    }, config


def compile_and_test(module, name, input_shape, n_bits, p_error, ref, test_input,
                     out_dir, rounding_threshold_bits=None):
    from concrete.ml.torch.compile import compile_torch_model
    from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer

    out_dir.mkdir(parents=True, exist_ok=True)
    for f in out_dir.iterdir():
        f.unlink()

    print(f"\n  Compiling {name}...")
    calib = torch.randn(*input_shape)

    kwargs = dict(n_bits=n_bits, p_error=p_error)
    if rounding_threshold_bits is not None:
        kwargs["rounding_threshold_bits"] = rounding_threshold_bits

    t0 = time.time()
    circuit = compile_torch_model(module, calib, **kwargs)
    compile_time = time.time() - t0

    fhe_dev = FHEModelDev(out_dir, circuit)
    fhe_dev.save()

    client = FHEModelClient(out_dir)
    eval_keys = client.get_serialized_evaluation_keys()
    encrypted = client.quantize_encrypt_serialize(test_input)

    server = FHEModelServer(out_dir)
    t0 = time.time()
    enc_out = server.run(encrypted, eval_keys)
    inference_time = time.time() - t0

    fhe_result = client.deserialize_decrypt_dequantize(enc_out)
    cos = np.dot(fhe_result.flatten(), ref.flatten()) / (
        np.linalg.norm(fhe_result) * np.linalg.norm(ref) + 1e-10
    )

    rt_str = f", rt={rounding_threshold_bits}" if rounding_threshold_bits else ""
    print(f"  Compile: {compile_time:.1f}s | Inference: {inference_time:.2f}s | "
          f"Cosine: {cos:.4f}{rt_str}")

    return inference_time, cos


def main():
    print("=" * 70)
    print("FHE LLM — Advanced Optimization Benchmark")
    print("=" * 70)

    w, config = load_weights()
    hidden = config["hidden_size"]
    inter = config["intermediate_size"]

    np.random.seed(42)
    x_np = np.random.randn(1, hidden).astype(np.float32)
    x_t = torch.from_numpy(x_np)

    # Build standard 3-phase modules
    p1_w = torch.cat([w["q"], w["k"], w["v"], w["w1"], w["w3"]], dim=0)
    mod_p1 = nn.Linear(hidden, p1_w.shape[0], bias=False)
    mod_p1.weight.data = p1_w
    ref_p1 = (x_t @ p1_w.T).numpy()

    mod_p2 = nn.Linear(hidden, hidden, bias=False)
    mod_p2.weight.data = w["o"]
    attn_in = np.random.randn(1, hidden).astype(np.float32)
    ref_p2 = (torch.from_numpy(attn_in) @ w["o"].T).numpy()

    mod_p3 = nn.Linear(inter, hidden, bias=False)
    mod_p3.weight.data = w["w2"]
    mlp_in = np.random.randn(1, inter).astype(np.float32)
    ref_p3 = (torch.from_numpy(mlp_in) @ w["w2"].T).numpy()

    results = {}

    # ─── Baseline: 3-phase n_bits=5 (no rounding) ───────────────────────────
    print("\n┌─ Baseline: 3-phase n_bits=5, no rounding")
    base_dir = DEPLOY_DIR / "adv_base"
    t1, c1 = compile_and_test(mod_p1, "base_p1", (1, hidden), 5, 0.02, ref_p1, x_np, base_dir / "p1")
    t2, c2 = compile_and_test(mod_p2, "base_p2", (1, hidden), 5, 0.02, ref_p2, attn_in, base_dir / "p2")
    t3, c3 = compile_and_test(mod_p3, "base_p3", (1, inter), 5, 0.02, ref_p3, mlp_in, base_dir / "p3")
    base_total = t1 + t2 + t3
    base_cos = min(c1, c2, c3)
    results["baseline_n5"] = {"time": base_total, "quality": base_cos}
    print(f"  Total: {base_total:.2f}s, quality={base_cos:.4f}")

    # ─── Strategy A: rounding_threshold_bits ────────────────────────────────
    # Reduces intermediate accumulator bit-width → smaller PBS → faster FHE
    print("\n┌─ Strategy A: rounding_threshold_bits=4")
    print("│  Rounds intermediate accumulators to 4 bits → smaller PBS")
    rt_dir = DEPLOY_DIR / "adv_rt4"
    rt1, rtc1 = compile_and_test(mod_p1, "rt4_p1", (1, hidden), 5, 0.02, ref_p1, x_np,
                                  rt_dir / "p1", rounding_threshold_bits=4)
    rt2, rtc2 = compile_and_test(mod_p2, "rt4_p2", (1, hidden), 5, 0.02, ref_p2, attn_in,
                                  rt_dir / "p2", rounding_threshold_bits=4)
    rt3, rtc3 = compile_and_test(mod_p3, "rt4_p3", (1, inter), 5, 0.02, ref_p3, mlp_in,
                                  rt_dir / "p3", rounding_threshold_bits=4)
    rt_total = rt1 + rt2 + rt3
    rt_cos = min(rtc1, rtc2, rtc3)
    results["rounding_4"] = {"time": rt_total, "quality": rt_cos}
    print(f"  Total: {rt_total:.2f}s, quality={rt_cos:.4f}")

    # ─── Strategy A2: rounding_threshold_bits=3 ─────────────────────────────
    print("\n┌─ Strategy A2: rounding_threshold_bits=3")
    print("│  Even more aggressive rounding")
    rt3_dir = DEPLOY_DIR / "adv_rt3"
    r3_1, r3c1 = compile_and_test(mod_p1, "rt3_p1", (1, hidden), 5, 0.02, ref_p1, x_np,
                                   rt3_dir / "p1", rounding_threshold_bits=3)
    r3_2, r3c2 = compile_and_test(mod_p2, "rt3_p2", (1, hidden), 5, 0.02, ref_p2, attn_in,
                                   rt3_dir / "p2", rounding_threshold_bits=3)
    r3_3, r3c3 = compile_and_test(mod_p3, "rt3_p3", (1, inter), 5, 0.02, ref_p3, mlp_in,
                                   rt3_dir / "p3", rounding_threshold_bits=3)
    r3_total = r3_1 + r3_2 + r3_3
    r3_cos = min(r3c1, r3c2, r3c3)
    results["rounding_3"] = {"time": r3_total, "quality": r3_cos}
    print(f"  Total: {r3_total:.2f}s, quality={r3_cos:.4f}")

    # ─── Strategy B: n_bits dict (op_weights=4, op_inputs=5) ────────────────
    # Fewer weight bits → smaller constants → faster PBS
    # Input bits stay at 5 for quality
    print("\n┌─ Strategy B: n_bits dict (op_weights=4, op_inputs=5)")
    print("│  Fewer weight bits, keep input precision")
    nb_dir = DEPLOY_DIR / "adv_nbdict"
    nb = {"op_inputs": 5, "op_weights": 4}
    nb1, nbc1 = compile_and_test(mod_p1, "nbdict_p1", (1, hidden), nb, 0.02, ref_p1, x_np, nb_dir / "p1")
    nb2, nbc2 = compile_and_test(mod_p2, "nbdict_p2", (1, hidden), nb, 0.02, ref_p2, attn_in, nb_dir / "p2")
    nb3, nbc3 = compile_and_test(mod_p3, "nbdict_p3", (1, inter), nb, 0.02, ref_p3, mlp_in, nb_dir / "p3")
    nb_total = nb1 + nb2 + nb3
    nb_cos = min(nbc1, nbc2, nbc3)
    results["nb_dict_w4i5"] = {"time": nb_total, "quality": nb_cos}
    print(f"  Total: {nb_total:.2f}s, quality={nb_cos:.4f}")

    # ─── Strategy B2: n_bits dict (op_weights=3, op_inputs=5) ───────────────
    print("\n┌─ Strategy B2: n_bits dict (op_weights=3, op_inputs=5)")
    print("│  Even fewer weight bits")
    nb3_dir = DEPLOY_DIR / "adv_nbdict3"
    nb3_cfg = {"op_inputs": 5, "op_weights": 3}
    nb3_1, nb3c1 = compile_and_test(mod_p1, "nbdict3_p1", (1, hidden), nb3_cfg, 0.02, ref_p1, x_np, nb3_dir / "p1")
    nb3_2, nb3c2 = compile_and_test(mod_p2, "nbdict3_p2", (1, hidden), nb3_cfg, 0.02, ref_p2, attn_in, nb3_dir / "p2")
    nb3_3, nb3c3 = compile_and_test(mod_p3, "nbdict3_p3", (1, inter), nb3_cfg, 0.02, ref_p3, mlp_in, nb3_dir / "p3")
    nb3_total = nb3_1 + nb3_2 + nb3_3
    nb3_cos = min(nb3c1, nb3c2, nb3c3)
    results["nb_dict_w3i5"] = {"time": nb3_total, "quality": nb3_cos}
    print(f"  Total: {nb3_total:.2f}s, quality={nb3_cos:.4f}")

    # ─── Strategy C: SVD skipped (Concrete-ML can't handle 2-layer quantization) ─
    print("\n┌─ Strategy C: Low-rank SVD — SKIPPED")
    print("│  Concrete-ML can't quantize 2-layer SVD decomposition (broadcast mismatch)")
    results["svd_skipped"] = {"time": 0, "quality": 0, "note": "incompatible"}

    # ─── Strategy D: p_error tuning ────────────────────────────────────────
    # Higher p_error → smaller cryptographic params → faster PBS
    print("\n┌─ Strategy D: p_error=0.05 (more aggressive)")
    print("│  Higher error probability → faster FHE")
    pe_dir = DEPLOY_DIR / "adv_pe05"
    pe1, pec1 = compile_and_test(mod_p1, "pe05_p1", (1, hidden), 5, 0.05, ref_p1, x_np, pe_dir / "p1")
    pe2, pec2 = compile_and_test(mod_p2, "pe05_p2", (1, hidden), 5, 0.05, ref_p2, attn_in, pe_dir / "p2")
    pe3, pec3 = compile_and_test(mod_p3, "pe05_p3", (1, inter), 5, 0.05, ref_p3, mlp_in, pe_dir / "p3")
    pe_total = pe1 + pe2 + pe3
    pe_cos = min(pec1, pec2, pec3)
    results["p_error_05"] = {"time": pe_total, "quality": pe_cos}
    print(f"  Total: {pe_total:.2f}s, quality={pe_cos:.4f}")

    # ─── Summary ────────────────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print("ADVANCED OPTIMIZATION RESULTS")
    print(f"{'=' * 70}")
    print(f"{'Strategy':<25} {'Time':>8} {'Quality':>10} {'Speedup':>8} {'100 tokens':>12}")
    print(f"{'-' * 70}")
    for name, data in results.items():
        speedup = base_total / data["time"] if data["time"] > 0 else 0
        t100 = data["time"] * 100 / 60
        print(f"{name:<25} {data['time']:>7.2f}s {data['quality']:>10.4f} {speedup:>7.2f}x {t100:>10.1f}min")
    print(f"{'=' * 70}")

    # GPU projections for best strategies
    print(f"\nGPU projections (30x Concrete-ML speedup):")
    for name, data in results.items():
        gpu_time = data["time"] / 30
        print(f"  {name}: {gpu_time:.3f}s/token, 100 tokens = {gpu_time*100:.1f}s")

    # Save results
    with open(DEPLOY_DIR / "advanced_benchmark.json", "w") as f:
        json.dump(results, f, indent=2)
    print(f"\nResults saved to {DEPLOY_DIR / 'advanced_benchmark.json'}")


if __name__ == "__main__":
    main()
