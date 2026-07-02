"""
FHE LLM — maximum speed with quality preservation.

Three small FHE calls instead of 2 large ones:
  Phase 1: q/k/v/w1/w3 merged (7168, 1024) — all projections, clean
  Phase 2: o_proj (1024, 1024) — attention output, tiny
  Phase 3: w2 (1024, 2560) — MLP down, medium

Client flow:
  1. Encrypt embedding → Phase 1 → decrypt → get q/k/v/gate/up
  2. Client: softmax(q@k^T)@v → encrypt → Phase 2 → decrypt → attn_out
  3. Client: SiLU(gate)*up → encrypt → Phase 3 → decrypt → mlp_out
  4. Client: attn_out + mlp_out = hidden_state

Each FHE call is small and fast. Quality preserved: all non-linear ops
run client-side in plaintext with real model weights.
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


def compile_and_test(module, name, input_shape, n_bits, p_error, ref, test_input, out_dir):
    from concrete.ml.torch.compile import compile_torch_model
    from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer

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

    print(f"  Compile: {compile_time:.1f}s | Inference: {inference_time:.2f}s | Cosine: {cos:.4f}")
    return inference_time, cos


def main():
    print("=" * 70)
    print("FHE LLM — Three-Phase Maximum Speed with Quality")
    print("=" * 70)

    w, config = load_weights()
    hidden = config["hidden_size"]
    inter = config["intermediate_size"]

    np.random.seed(42)
    x_np = np.random.randn(1, hidden).astype(np.float32)
    x_t = torch.from_numpy(x_np)

    results = {}

    # Phase 1: q/k/v/w1/w3 (7168, 1024) — same as original, proven quality
    print("\n─ Phase 1: q/k/v/w1/w3 (7168, 1024)")
    p1_w = torch.cat([w["q"], w["k"], w["v"], w["w1"], w["w3"]], dim=0)
    mod1 = nn.Linear(hidden, p1_w.shape[0], bias=False)
    mod1.weight.data = p1_w
    ref1 = (x_t @ p1_w.T).numpy()
    p1_dir = DEPLOY_DIR / "lfm2_3p_phase1"
    t1, c1 = compile_and_test(mod1, "phase1", (1, hidden), 5, 0.02, ref1, x_np, p1_dir)
    results["phase1"] = {"time": t1, "cos": c1, "shape": list(p1_w.shape)}

    # Phase 2: o_proj (1024, 1024) — tiny, fast
    print("\n─ Phase 2: o_proj (1024, 1024)")
    mod2 = nn.Linear(hidden, hidden, bias=False)
    mod2.weight.data = w["o"]
    attn_in = np.random.randn(1, hidden).astype(np.float32)
    ref2 = (torch.from_numpy(attn_in) @ w["o"].T).numpy()
    p2_dir = DEPLOY_DIR / "lfm2_3p_phase2"
    t2, c2 = compile_and_test(mod2, "phase2", (1, hidden), 5, 0.02, ref2, attn_in, p2_dir)
    results["phase2"] = {"time": t2, "cos": c2, "shape": [hidden, hidden]}

    # Phase 3: w2 (1024, 2560) — MLP down
    print("\n─ Phase 3: w2 MLP down (1024, 2560)")
    mod3 = nn.Linear(inter, hidden, bias=False)
    mod3.weight.data = w["w2"]
    mlp_in = np.random.randn(1, inter).astype(np.float32)
    ref3 = (torch.from_numpy(mlp_in) @ w["w2"].T).numpy()
    p3_dir = DEPLOY_DIR / "lfm2_3p_phase3"
    t3, c3 = compile_and_test(mod3, "phase3", (1, inter), 5, 0.02, ref3, mlp_in, p3_dir)
    results["phase3"] = {"time": t3, "cos": c3, "shape": [hidden, inter]}

    total = t1 + t2 + t3
    min_cos = min(c1, c2, c3)

    print(f"\n{'=' * 70}")
    print("THREE-PHASE RESULTS")
    print(f"{'=' * 70}")
    print(f"  Phase 1 (q/k/v/w1/w3): {t1:.2f}s, cosine={c1:.4f}")
    print(f"  Phase 2 (o_proj):      {t2:.2f}s, cosine={c2:.4f}")
    print(f"  Phase 3 (w2 MLP down): {t3:.2f}s, cosine={c3:.4f}")
    print(f"  Total: {total:.2f}s/token, min quality={min_cos:.4f}")
    print(f"  100 tokens: {total * 100 / 60:.1f} min")
    print(f"  3 FHE calls, all with real LFM2.5-230M weights")
    print(f"  Client does softmax + SiLU in plaintext (full quality)")
    print(f"{'=' * 70}")

    # Comparison
    print(f"\nComparison:")
    print(f"  Original 2-phase:    7.32s, quality=0.9359")
    print(f"  Composed 1-phase:    1.36s, quality=0.7955")
    print(f"  Balanced 2-phase:    3.19s, quality=0.8541")
    print(f"  NEW 3-phase:         {total:.2f}s, quality={min_cos:.4f}")
    print(f"  Speedup vs original: {7.32/total:.1f}x")

    # Save metadata
    metadata = {
        "model_id": MODEL_ID,
        "model_type": "lfm2_three_phase_fhe",
        "hidden_size": hidden,
        "intermediate_size": inter,
        "n_bits": 5,
        "p_error": 0.02,
        "phases": results,
        "total_inference_time": total,
        "quality": min_cos,
        "phase1_dir": str(p1_dir),
        "phase2_dir": str(p2_dir),
        "phase3_dir": str(p3_dir),
        "client_flow": [
            "1. Encrypt embedding → Phase 1 → decrypt → q/k/v/gate/up",
            "2. Client: softmax(q@k^T)@v → encrypt → Phase 2 → decrypt → attn_out",
            "3. Client: SiLU(gate)*up → encrypt → Phase 3 → decrypt → mlp_out",
            "4. Client: attn_out + mlp_out = hidden_state",
        ],
    }
    with open(DEPLOY_DIR / "lfm2_fhe" / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)
    print(f"\nSaved to {DEPLOY_DIR / 'lfm2_fhe' / 'metadata.json'}")


if __name__ == "__main__":
    main()
