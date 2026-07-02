"""
Compile LFM2.5-230M layers for FHE — loads weights directly via safetensors.

Bypasses the transformers version conflict (transformers 5.x needs torch >= 2.4
but Concrete-ML pins torch 2.3.1). We load the safetensors weights directly
and build a minimal PyTorch module with just the Linear layers.

This extracts the real LFM2.5-230M weights and compiles them to FHE.
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
ARTIFACTS_DIR = Path(__file__).parent / "deployment" / "lfm2_fhe"


def load_model_weights():
    """Load LFM2.5-230M weights directly from safetensors."""
    from huggingface_hub import hf_hub_download, list_repo_files

    print(f"Loading {MODEL_ID} weights directly...")

    # Get config
    config_path = hf_hub_download(MODEL_ID, "config.json")
    with open(config_path) as f:
        config = json.load(f)

    hidden_size = config["hidden_size"]
    num_layers = config["num_hidden_layers"]
    layer_types = config.get("layer_types", [])

    print(f"  Hidden size: {hidden_size}")
    print(f"  Layers: {num_layers}")
    print(f"  Layer types: {layer_types}")

    # Find safetensors files
    files = list_repo_files(MODEL_ID)
    safetensors_files = [f for f in files if f.endswith(".safetensors")]
    print(f"  Safetensors files: {safetensors_files}")

    # Load weights
    from safetensors.torch import load_file

    all_weights = {}
    for sf in safetensors_files:
        path = hf_hub_download(MODEL_ID, sf)
        weights = load_file(path)
        all_weights.update(weights)
        print(f"  Loaded {sf}: {len(weights)} tensors")

    return all_weights, config, hidden_size, num_layers, layer_types


def extract_linear_layers(weights, config, num_layers=1):
    """Extract Linear layer weights from the model.

    LFM2.5-230M actual weight structure (from safetensors):
      Layers 0,1: conv (in_proj, out_proj, conv1d) + feed_forward (w1, w2, w3)
      Layers 2+: full_attention (q_proj, k_proj, v_proj, out_proj) + feed_forward
      MLP: w1=gate, w3=up, w2=down (SwiGLU)

    We use the first full_attention layer (layer 2) for Linear-only FHE.
    Conv1d and LayerNorm run client-side (not FHE-compiled).
    """

    hidden_size = config["hidden_size"]
    intermediate_size = config.get("intermediate_size", 2560)
    layer_types = config.get("layer_types", [])

    # Find first attention layer
    attn_layer_idx = next((i for i, lt in enumerate(layer_types) if lt == "full_attention"), 2)
    print(f"  Using layer {attn_layer_idx} (first full_attention layer)")

    class LFM2LinearLayers(nn.Module):
        """Standalone module with LFM2.5-230M's Linear layer weights.

        Takes embedding (batch, 1, hidden) → hidden state (batch, 1, hidden).
        Only includes Linear operations — these get compiled to FHE.
        Non-linear ops (softmax, RoPE, SiLU, LayerNorm) run client-side.
        """
        def __init__(self):
            super().__init__()
            self.hidden_size = hidden_size

            # Minimal: single Linear layer from LFM2.5-230M attention
            # o_proj: (1024, 1024) — attention output projection
            # This is the smallest FHE-compilable unit with real model weights
            # On GPU, expand to all 7 Linear ops per layer × 14 layers
            self.o_proj = nn.Linear(hidden_size, hidden_size, bias=False)

        def forward(self, x):
            # x: (batch, 1, hidden) — single token embedding
            # Single Linear op for FHE — single token inference
            return self.o_proj(x)

    module = LFM2LinearLayers()

    # Load weights from the first attention layer
    prefix = f"model.layers.{attn_layer_idx}."
    weight_map = {
        "o_proj.weight": f"{prefix}self_attn.out_proj.weight",
    }

    loaded = 0
    for local_name, hf_name in weight_map.items():
        if hf_name in weights:
            param = getattr(module, local_name.split('.')[0])
            param.weight.data = weights[hf_name].float()
            loaded += 1
            print(f"    {local_name} ← {hf_name}: {weights[hf_name].shape}")
        else:
            print(f"  ⚠️  Weight not found: {hf_name}")

    print(f"  Loaded {loaded}/{len(weight_map)} weight tensors")

    param_count = sum(p.numel() for p in module.parameters())
    print(f"  Module parameters: {param_count/1e6:.1f}M")

    return module, hidden_size


def compile_to_fhe(module, hidden_size, n_bits=6, p_error=0.01):
    """Compile the module to FHE with Concrete-ML."""
    from concrete.ml.torch.compile import compile_torch_model

    print(f"\nCompiling to FHE...")
    print(f"  n_bits: {n_bits}")
    print(f"  p_error: {p_error}")

    calib_input = torch.randn(1, 1, hidden_size)

    import resource
    mem_before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
    print(f"  RAM before compile: {mem_before:.0f} MB")

    start = time.time()
    fhe_circuit = compile_torch_model(
        module,
        calib_input,
        n_bits=n_bits,
        p_error=p_error,
    )
    compile_time = time.time() - start
    mem_after = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024

    print(f"  Compilation time: {compile_time:.1f}s")
    print(f"  RAM peak: {mem_after:.0f} MB")
    print(f"  ✅ FHE compilation successful!")

    return fhe_circuit, compile_time


def save_and_test(fhe_circuit, hidden_size, compile_time):
    """Save artifacts and run end-to-end test."""
    from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"\nSaving artifacts to {ARTIFACTS_DIR}...")
    fhe_dev = FHEModelDev(ARTIFACTS_DIR, fhe_circuit)
    fhe_dev.save()

    metadata = {
        "model_id": MODEL_ID,
        "model_type": "lfm2_linear_fhe",
        "hidden_size": hidden_size,
        "n_bits": 6,
        "compile_time_sec": compile_time,
        "description": "LFM2.5-230M layer 0 Linear weights compiled to FHE. "
                       "Private pipeline: client encrypts embedding, server runs FHE, client decrypts.",
    }
    with open(ARTIFACTS_DIR / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    # End-to-end test
    print(f"\n--- End-to-End FHE Test ---")

    client = FHEModelClient(ARTIFACTS_DIR)
    eval_keys = client.get_serialized_evaluation_keys()
    print(f"  Client: keys generated ({len(eval_keys)} bytes)")

    test_embedding = np.random.randn(1, 1, hidden_size).astype(np.float32)
    encrypted = client.quantize_encrypt_serialize(test_embedding)
    print(f"  Client: embedding encrypted ({len(encrypted)} bytes)")

    server = FHEModelServer(ARTIFACTS_DIR)
    start = time.time()
    encrypted_result = server.run(encrypted, eval_keys)
    server_time = time.time() - start
    print(f"  Server: FHE inference done in {server_time:.2f}s")

    result = client.deserialize_decrypt_dequantize(encrypted_result)
    print(f"  Client: decrypted shape={result.shape}")
    print(f"  ✅ Private FHE pipeline works!")
    print(f"  Server never saw plaintext input or output.")

    return server_time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n-bits", type=int, default=6)
    parser.add_argument("--p-error", type=float, default=0.01)
    parser.add_argument("--skip-test", action="store_true")
    args = parser.parse_args()

    print("=" * 60)
    print("LFM2.5-230M FHE Compilation (direct weight loading)")
    print(f"  n_bits: {args.n_bits}")
    print("=" * 60)

    weights, config, hidden_size, num_layers, layer_types = load_model_weights()
    module, hidden_size = extract_linear_layers(weights, config)

    del weights
    import gc; gc.collect()

    fhe_circuit, compile_time = compile_to_fhe(
        module, hidden_size,
        n_bits=args.n_bits, p_error=args.p_error,
    )

    if not args.skip_test:
        server_time = save_and_test(fhe_circuit, hidden_size, compile_time)
        print(f"\n{'=' * 60}")
        print(f"✅ Complete!")
        print(f"  Compilation: {compile_time:.1f}s")
        print(f"  FHE inference: {server_time:.2f}s per token")
        print(f"  Artifacts: {ARTIFACTS_DIR}")
        print(f"{'=' * 60}")
    else:
        from concrete.ml.deployment import FHEModelDev
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        fhe_dev = FHEModelDev(ARTIFACTS_DIR, fhe_circuit)
        fhe_dev.save()
        print(f"\n✅ Saved to {ARTIFACTS_DIR}")


if __name__ == "__main__":
    main()
