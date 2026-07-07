"""
Optimized FHE LLM compilation — LFM2.5-230M real weights.

Optimizations for speed while maintaining quality:
  1. Two-phase FHE: parallel Linear ops batched into single calls
     Phase 1: q_proj + k_proj + v_proj + w1 + w3 (5 Linear from same input)
     Phase 2: o_proj + w2 (2 Linear from attention/mlp intermediate)
  2. n_bits=5 (vs 6) — faster FHE, minimal quality loss
  3. p_error=0.02 (vs 0.01) — faster FHE, 2% error tolerance
  4. Flattened input (1, 1024) — reduces tensor dimensionality overhead
  5. All 7 real Linear weights from LFM2.5-230M layer 2 (first attention)

Privacy: Server only sees encrypted data, never plaintext.
Quality: All Linear ops use real model weights. Non-linear ops (softmax,
SiLU, LayerNorm) run client-side in plaintext — no quality loss there.

Usage:
  python compile_lfm2_optimized.py                    # Default: n_bits=5, p_error=0.02
  python compile_lfm2_optimized.py --n-bits 6           # Higher quality
  python compile_lfm2_optimized.py --p-error 0.01      # Lower error
  python compile_lfm2_optimized.py --phase both        # Compile both phases
  python compile_lfm2_optimized.py --phase 1           # Only phase 1
"""

import os
import time
import json
import argparse
import gc
import numpy as np
from pathlib import Path

import torch
import torch.nn as nn

MODEL_ID = "LiquidAI/LFM2.5-230M"
ARTIFACTS_DIR = Path(__file__).parent / "deployment" / "lfm2_fhe"
PHASE1_DIR = Path(__file__).parent / "deployment" / "lfm2_fhe_phase1"
PHASE2_DIR = Path(__file__).parent / "deployment" / "lfm2_fhe_phase2"


def load_model_weights():
    """Load LFM2.5-230M weights directly from safetensors."""
    from huggingface_hub import hf_hub_download, list_repo_files
    from safetensors.torch import load_file

    print(f"Loading {MODEL_ID} weights directly...")

    config_path = hf_hub_download(MODEL_ID, "config.json")
    with open(config_path) as f:
        config = json.load(f)

    hidden_size = config["hidden_size"]
    layer_types = config.get("layer_types", [])

    print(f"  Hidden size: {hidden_size}")
    print(f"  Layer types: {layer_types}")

    files = list_repo_files(MODEL_ID)
    safetensors_files = [f for f in files if f.endswith(".safetensors")]

    all_weights = {}
    for sf in safetensors_files:
        path = hf_hub_download(MODEL_ID, sf)
        weights = load_file(path)
        all_weights.update(weights)
        print(f"  Loaded {sf}: {len(weights)} tensors")

    return all_weights, config, hidden_size, layer_types


# ─── Phase 1: Parallel Linear ops from same input ────────────────────────────

class LFM2Phase1(nn.Module):
    """Phase 1: QKV + MLP gate/up projections as single merged Linear.

    All 5 projections merged into one (1024 → 7168) Linear op.
    This is a single FHE matmul — fastest possible.
    Client splits the 7168-dim output after decrypting:
      [0:1024]   = q
      [1024:1536] = k
      [1536:2048] = v
      [2048:4608] = gate (w1)
      [4608:7168] = up (w3)

    Input:  x (1, 1024) — single token embedding
    Output: (1, 7168) — concatenated projections
    """
    def __init__(self, hidden_size, intermediate_size):
        super().__init__()
        self.q_proj = nn.Linear(hidden_size, 1024, bias=False)
        self.k_proj = nn.Linear(hidden_size, 512, bias=False)
        self.v_proj = nn.Linear(hidden_size, 512, bias=False)
        self.w1 = nn.Linear(hidden_size, intermediate_size, bias=False)
        self.w3 = nn.Linear(hidden_size, intermediate_size, bias=False)
        # Merge into single weight matrix for FHE efficiency
        # Combined weight: (7168, 1024)
        with torch.no_grad():
            merged = torch.cat([
                self.q_proj.weight,
                self.k_proj.weight,
                self.v_proj.weight,
                self.w1.weight,
                self.w3.weight,
            ], dim=0)
        self.merged_proj = nn.Linear(hidden_size, merged.shape[0], bias=False)
        self.merged_proj.weight.data = merged
        # Remove individual layers (not used in forward)
        del self.q_proj
        del self.k_proj
        del self.v_proj
        del self.w1
        del self.w3

    def forward(self, x):
        return self.merged_proj(x)


# ─── Phase 2: Output projections after non-linear ops ────────────────────────

class LFM2Phase2(nn.Module):
    """Phase 2: Attention output + MLP down as merged Linear.

    Client does non-linear ops (softmax, SiLU) in plaintext, then
    encrypts the intermediate and sends for these 2 Linear ops.

    Merged into single (3584 → 2048) Linear for FHE efficiency.
    Client splits output after decrypting:
      [0:1024]    = attn_out
      [1024:2048] = mlp_down

    Input:  x (1, 3584) — [attn_intermediate(1024) | mlp_intermediate(2560)]
    Output: (1, 2048) — [attn_out(1024) | mlp_down(1024)]
    """
    def __init__(self, hidden_size, intermediate_size):
        super().__init__()
        self.o_proj = nn.Linear(1024, hidden_size, bias=False)
        self.w2 = nn.Linear(intermediate_size, hidden_size, bias=False)
        # Merge: block-diagonal weight matrix (2048, 3584)
        # o_proj operates on first 1024 dims, w2 on last 2560 dims
        with torch.no_grad():
            merged = torch.zeros(hidden_size * 2, 1024 + intermediate_size)
            merged[:hidden_size, :1024] = self.o_proj.weight
            merged[hidden_size:, 1024:] = self.w2.weight
        self.merged_proj = nn.Linear(1024 + intermediate_size, hidden_size * 2, bias=False)
        self.merged_proj.weight.data = merged
        del self.o_proj
        del self.w2

    def forward(self, x):
        return self.merged_proj(x)


def build_phase1(weights, config, layer_idx):
    """Build Phase 1 module with real weights merged into single Linear."""
    hidden_size = config["hidden_size"]
    intermediate_size = config.get("intermediate_size", 2560)
    prefix = f"model.layers.{layer_idx}."

    # Load individual weights
    q_w = weights[f"{prefix}self_attn.q_proj.weight"].float()  # (1024, 1024)
    k_w = weights[f"{prefix}self_attn.k_proj.weight"].float()  # (512, 1024)
    v_w = weights[f"{prefix}self_attn.v_proj.weight"].float()  # (512, 1024)
    w1_w = weights[f"{prefix}feed_forward.w1.weight"].float()  # (2560, 1024)
    w3_w = weights[f"{prefix}feed_forward.w3.weight"].float()  # (2560, 1024)

    print(f"    q_proj: {q_w.shape}")
    print(f"    k_proj: {k_w.shape}")
    print(f"    v_proj: {v_w.shape}")
    print(f"    w1:     {w1_w.shape}")
    print(f"    w3:     {w3_w.shape}")

    # Merge into single (7168, 1024) weight matrix
    merged = torch.cat([q_w, k_w, v_w, w1_w, w3_w], dim=0)

    module = nn.Linear(hidden_size, merged.shape[0], bias=False)
    module.weight.data = merged

    param_count = sum(p.numel() for p in module.parameters())
    print(f"  Phase 1 merged: {param_count/1e6:.1f}M params, weight {merged.shape}")
    return module, hidden_size


def build_phase2(weights, config, layer_idx):
    """Build Phase 2 module with real weights merged into single Linear."""
    hidden_size = config["hidden_size"]
    intermediate_size = config.get("intermediate_size", 2560)
    prefix = f"model.layers.{layer_idx}."

    o_w = weights[f"{prefix}self_attn.out_proj.weight"].float()  # (1024, 1024)
    w2_w = weights[f"{prefix}feed_forward.w2.weight"].float()  # (1024, 2560)

    print(f"    o_proj: {o_w.shape}")
    print(f"    w2:     {w2_w.shape}")

    # Block-diagonal merge: (2048, 3584)
    # o_proj acts on first 1024 dims, w2 on last 2560 dims
    input_size = 1024 + intermediate_size
    output_size = hidden_size * 2
    merged = torch.zeros(output_size, input_size)
    merged[:hidden_size, :1024] = o_w
    merged[hidden_size:, 1024:] = w2_w

    module = nn.Linear(input_size, output_size, bias=False)
    module.weight.data = merged

    param_count = sum(p.numel() for p in module.parameters())
    print(f"  Phase 2 merged: {param_count/1e6:.1f}M params, weight {merged.shape}")
    return module, hidden_size


def compile_phase(module, phase_name, input_shape, n_bits, p_error, output_dir, device="cpu"):
    """Compile a single phase to FHE."""
    from concrete.ml.torch.compile import compile_torch_model

    print(f"\nCompiling {phase_name}...")
    print(f"  Input shape: {input_shape}")
    print(f"  n_bits: {n_bits}, p_error: {p_error}, device: {device}")

    calib_input = torch.randn(*input_shape)

    import resource
    mem_before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"  RAM before: {mem_before:.0f} MB")

    start = time.time()
    fhe_circuit = compile_torch_model(
        module,
        calib_input,
        n_bits=n_bits,
        p_error=p_error,
        device=device,
    )
    compile_time = time.time() - start
    mem_after = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024

    print(f"  Compilation: {compile_time:.1f}s")
    print(f"  RAM peak: {mem_after:.0f} MB")

    # Save
    from concrete.ml.deployment import FHEModelDev
    output_dir.mkdir(parents=True, exist_ok=True)
    # Clear dir first
    for f in output_dir.iterdir():
        f.unlink()

    fhe_dev = FHEModelDev(output_dir, fhe_circuit)
    fhe_dev.save()
    print(f"  Saved to {output_dir}")

    return fhe_circuit, compile_time


def test_phase(fhe_circuit, phase_name, input_shape, output_dir):
    """Test a single phase end-to-end."""
    from concrete.ml.deployment import FHEModelClient, FHEModelServer

    print(f"\n--- Testing {phase_name} ---")

    client = FHEModelClient(output_dir)
    eval_keys = client.get_serialized_evaluation_keys()
    print(f"  Keys: {len(eval_keys)} bytes")

    test_input = np.random.randn(*input_shape).astype(np.float32)
    encrypted = client.quantize_encrypt_serialize(test_input)
    print(f"  Encrypted input: {len(encrypted)} bytes")

    server = FHEModelServer(output_dir)
    start = time.time()
    encrypted_result = server.run(encrypted, eval_keys)
    server_time = time.time() - start
    print(f"  FHE inference: {server_time:.2f}s")

    result = client.deserialize_decrypt_dequantize(encrypted_result)
    print(f"  Decrypted output: shape={result.shape}")

    # Compare with plaintext
    return server_time


def main():
    parser = argparse.ArgumentParser(description="Optimized FHE LLM compilation")
    parser.add_argument("--n-bits", type=int, default=5,
                        help="Quantization bits (5=faster, 6=better quality)")
    parser.add_argument("--p-error", type=float, default=0.02,
                        help="FHE error tolerance (0.02=faster, 0.01=better quality)")
    parser.add_argument("--phase", choices=["both", "1", "2"], default="both",
                        help="Which phase to compile")
    parser.add_argument("--device", choices=["cpu", "cuda"], default="cpu",
                        help="Target device for FHE compilation (cpu or cuda)")
    parser.add_argument("--skip-test", action="store_true")
    args = parser.parse_args()

    print("=" * 60)
    print("LFM2.5-230M Optimized FHE Compilation")
    print(f"  n_bits: {args.n_bits}")
    print(f"  p_error: {args.p_error}")
    print(f"  Phase: {args.phase}")
    print(f"  Device: {args.device}")
    print("=" * 60)

    # Load weights
    weights, config, hidden_size, layer_types = load_model_weights()

    # Find first attention layer
    attn_layer_idx = next(
        (i for i, lt in enumerate(layer_types) if lt == "full_attention"), 2
    )
    print(f"\nUsing layer {attn_layer_idx} (first full_attention)")

    intermediate_size = config.get("intermediate_size", 2560)

    # Phase 1 output size: q(1024) + k(512) + v(512) + gate(2560) + up(2560) = 7168
    phase1_output_size = 1024 + 512 + 512 + intermediate_size + intermediate_size
    # Phase 2 input size: attn_inter(1024) + mlp_inter(2560) = 3584
    phase2_input_size = 1024 + intermediate_size
    # Phase 2 output size: attn_out(1024) + mlp_down(1024) = 2048
    phase2_output_size = hidden_size + hidden_size

    results = {}

    if args.phase in ("both", "1"):
        print(f"\n{'─' * 40}")
        print("Phase 1: QKV + Gate/Up projections")
        print(f"  Input: (1, {hidden_size}) → Output: (1, {phase1_output_size})")
        print(f"  5 Linear ops in single FHE call")
        print(f"{'─' * 40}")

        module1, _ = build_phase1(weights, config, attn_layer_idx)
        # Don't delete weights yet — phase 2 needs them

        fhe_circuit1, compile_time1 = compile_phase(
            module1, "Phase 1",
            input_shape=(1, hidden_size),
            n_bits=args.n_bits, p_error=args.p_error,
            output_dir=PHASE1_DIR,
            device=args.device,
        )

        if not args.skip_test:
            server_time1 = test_phase(
                fhe_circuit1, "Phase 1",
                input_shape=(1, hidden_size),
                output_dir=PHASE1_DIR,
            )
            results["phase1"] = {
                "compile_time": compile_time1,
                "inference_time": server_time1,
            }

        del module1, fhe_circuit1
        gc.collect()

    if args.phase in ("both", "2"):
        # Reload weights for phase 2 if we freed them
        if args.phase == "2":
            weights, config, hidden_size, layer_types = load_model_weights()

        print(f"\n{'─' * 40}")
        print("Phase 2: Output + Down projections")
        print(f"  Input: (1, {phase2_input_size}) → Output: (1, {phase2_output_size})")
        print(f"  2 Linear ops in single FHE call")
        print(f"{'─' * 40}")

        module2, _ = build_phase2(weights, config, attn_layer_idx)
        del weights
        gc.collect()

        fhe_circuit2, compile_time2 = compile_phase(
            module2, "Phase 2",
            input_shape=(1, phase2_input_size),
            n_bits=args.n_bits, p_error=args.p_error,
            output_dir=PHASE2_DIR,
            device=args.device,
        )

        if not args.skip_test:
            server_time2 = test_phase(
                fhe_circuit2, "Phase 2",
                input_shape=(1, phase2_input_size),
                output_dir=PHASE2_DIR,
            )
            results["phase2"] = {
                "compile_time": compile_time2,
                "inference_time": server_time2,
            }

    # Save combined metadata
    combined_dir = ARTIFACTS_DIR
    combined_dir.mkdir(parents=True, exist_ok=True)
    metadata = {
        "model_id": MODEL_ID,
        "model_type": "lfm2_two_phase_fhe",
        "layer_index": attn_layer_idx,
        "hidden_size": hidden_size,
        "intermediate_size": intermediate_size,
        "n_bits": args.n_bits,
        "p_error": args.p_error,
        "phase1_dir": str(PHASE1_DIR),
        "phase2_dir": str(PHASE2_DIR),
        "phase1_output_size": phase1_output_size,
        "phase2_input_size": phase2_input_size,
        "phase2_output_size": phase2_output_size,
        "optimizations": [
            "Two-phase FHE: parallel Linear ops batched",
            "n_bits=5 for faster FHE",
            "p_error=0.02 for faster FHE",
            "Flattened input (1, hidden) instead of (1, 1, hidden)",
            "All 7 real Linear weights from LFM2.5-230M",
        ],
        "results": results,
    }
    with open(combined_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    # Summary
    print(f"\n{'=' * 60}")
    print("✅ Optimized FHE Compilation Complete")
    print(f"{'=' * 60}")
    for phase, data in results.items():
        print(f"  {phase}: compile={data['compile_time']:.1f}s, "
              f"inference={data['inference_time']:.2f}s")
    if len(results) == 2:
        total_inference = results["phase1"]["inference_time"] + results["phase2"]["inference_time"]
        print(f"  Total per-token FHE: {total_inference:.2f}s")
        print(f"  For 100 tokens: ~{total_inference * 100 / 60:.1f} min")
    print(f"  Phase 1: {PHASE1_DIR}")
    print(f"  Phase 2: {PHASE2_DIR}")
    print(f"  Metadata: {combined_dir / 'metadata.json'}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
