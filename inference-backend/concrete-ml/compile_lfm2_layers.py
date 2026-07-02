"""
Compile real LFM2.5-230M layers for FHE — single token inference.

Loads the actual LFM2.5-230M model, extracts 1-2 transformer layers,
and compiles them to FHE with Concrete-ML. This uses the REAL model weights,
just truncated to fit available RAM.

The private pipeline is identical whether we compile 1 layer or 14:
  Client encrypts embedding → Server runs FHE on encrypted data → Client decrypts

When more RAM/GPU is available, change NUM_LAYERS to 14 for the full model.

Usage:
  python compile_lfm2_layers.py                     # 1 layer, hidden=1024
  python compile_lfm2_layers.py --num-layers 2      # 2 layers
  python compile_lfm2_layers.py --num-layers 1 --n-bits 4  # Lower precision
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


def load_lfm2_model():
    """Load LFM2.5-230M from HuggingFace."""
    from transformers import AutoModelForCausalLM, AutoTokenizer

    print(f"Loading {MODEL_ID}...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        torch_dtype=torch.float32,
        device_map="cpu",
        low_cpu_mem_usage=True,
    )
    model.eval()

    print(f"  Layers: {model.config.num_hidden_layers}")
    print(f"  Hidden size: {model.config.hidden_size}")
    print(f"  Vocab size: {model.config.vocab_size}")

    return model, tokenizer


def extract_layers(model, num_layers=1):
    """Extract the first N transformer layers as a standalone module.

    This creates a PyTorch module that takes embeddings as input and
    outputs hidden states — exactly what the FHE server needs to run.
    """
    hidden_size = model.config.hidden_size

    class TruncatedLLM(nn.Module):
        """First N layers of LFM2.5-230M for FHE compilation."""
        def __init__(self, base_model, n_layers):
            super().__init__()
            self.layers = nn.ModuleList()
            # Extract the first n_layers from the model's layers
            for i in range(min(n_layers, len(base_model.model.layers))):
                self.layers.append(base_model.model.layers[i])

        def forward(self, x):
            # x shape: (batch, seq, hidden) or (batch, hidden)
            if x.dim() == 2:
                x = x.unsqueeze(1)  # (batch, 1, hidden)
            for layer in self.layers:
                # LFM2 layers may need specific calling convention
                # Try the standard transformer layer call
                try:
                    x = layer(x)[0]
                except TypeError:
                    # Some layers need position_ids or attention_mask
                    x = layer(x, attention_mask=None, position_ids=None)[0]
            return x

    truncated = TruncatedLLM(model, num_layers)
    param_count = sum(p.numel() for p in truncated.parameters())
    print(f"  Extracted {num_layers} layer(s), {param_count/1e6:.1f}M params")
    return truncated, hidden_size


def compile_to_fhe(model_module, hidden_size, n_bits=6, p_error=0.01):
    """Compile the extracted layers to FHE using Concrete-ML."""
    from concrete.ml.torch.compile import compile_torch_model

    print(f"\nCompiling to FHE...")
    print(f"  n_bits: {n_bits}")
    print(f"  p_error: {p_error}")

    # Calibration input — single token embedding
    calib_input = torch.randn(1, 1, hidden_size)

    # Track memory
    import resource
    mem_before = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024  # MB
    print(f"  RAM before compile: {mem_before:.0f} MB")

    start = time.time()
    try:
        fhe_circuit = compile_torch_model(
            model_module,
            calib_input,
            n_bits=n_bits,
            p_error=p_error,
        )
        compile_time = time.time() - start
        mem_after = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024
        print(f"  Compilation time: {compile_time:.1f}s")
        print(f"  RAM after compile: {mem_after:.0f} MB (peak)")
        print(f"  ✅ FHE compilation successful!")
        return fhe_circuit, compile_time
    except Exception as e:
        print(f"  ❌ Compilation failed: {e}")
        print(f"  Try reducing --num-layers or --n-bits")
        raise


def save_and_test(fhe_circuit, hidden_size, num_layers, compile_time):
    """Save FHE artifacts and run end-to-end test."""
    from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    # Save
    print(f"\nSaving artifacts to {ARTIFACTS_DIR}...")
    fhe_dev = FHEModelDev(ARTIFACTS_DIR, fhe_circuit)
    fhe_dev.save()

    # Save metadata
    metadata = {
        "model_id": MODEL_ID,
        "model_type": "lfm2_truncated_fhe",
        "num_layers": num_layers,
        "total_layers_in_full_model": 14,
        "hidden_size": hidden_size,
        "compile_time_sec": compile_time,
        "note": f"First {num_layers} layer(s) of LFM2.5-230M compiled to FHE. "
                f"Set num_layers=14 for full model (needs 32-64GB RAM).",
    }
    with open(ARTIFACTS_DIR / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    # End-to-end test
    print(f"\n--- End-to-End FHE Test ---")

    # Client: generate keys + encrypt
    client = FHEModelClient(ARTIFACTS_DIR)
    eval_keys = client.get_serialized_evaluation_keys()
    print(f"  Client: keys generated ({len(eval_keys)} bytes)")

    # Simulate encrypted embedding (what browser client would send)
    test_embedding = np.random.randn(1, 1, hidden_size).astype(np.float32)
    encrypted = client.quantize_encrypt_serialize(test_embedding)
    print(f"  Client: embedding encrypted ({len(encrypted)} bytes)")

    # Server: FHE inference on encrypted data (NEVER sees plaintext)
    server = FHEModelServer(ARTIFACTS_DIR)
    start = time.time()
    encrypted_result = server.run(encrypted, eval_keys)
    server_time = time.time() - start
    print(f"  Server: FHE inference done in {server_time:.2f}s")

    # Client: decrypt
    result = client.deserialize_decrypt_dequantize(encrypted_result)
    print(f"  Client: decrypted hidden state shape={result.shape}")
    print(f"  ✅ Private FHE pipeline works end-to-end!")
    print(f"  Server never saw plaintext input or output.")

    return server_time


def main():
    parser = argparse.ArgumentParser(description="Compile LFM2.5-230M layers to FHE")
    parser.add_argument("--num-layers", type=int, default=1,
                        help="Number of transformer layers to compile (default 1)")
    parser.add_argument("--n-bits", type=int, default=6,
                        help="Quantization bits (4-8, default 6)")
    parser.add_argument("--p-error", type=float, default=0.01,
                        help="FHE error tolerance (default 0.01)")
    parser.add_argument("--skip-test", action="store_true",
                        help="Skip end-to-end test")
    args = parser.parse_args()

    print("=" * 60)
    print(f"LFM2.5-230M FHE Compilation")
    print(f"  Layers: {args.num_layers}/14")
    print(f"  n_bits: {args.n_bits}")
    print(f"  p_error: {args.p_error}")
    print("=" * 60)

    # Step 1: Load model
    model, tokenizer = load_lfm2_model()

    # Step 2: Extract layers
    print(f"\nExtracting {args.num_layers} layer(s)...")
    truncated, hidden_size = extract_layers(model, args.num_layers)

    # Free the full model to save RAM
    del model
    import gc
    gc.collect()
    print(f"  Full model freed from memory")

    # Step 3: Compile to FHE
    fhe_circuit, compile_time = compile_to_fhe(
        truncated, hidden_size,
        n_bits=args.n_bits, p_error=args.p_error,
    )

    # Step 4: Save + test
    if not args.skip_test:
        server_time = save_and_test(
            fhe_circuit, hidden_size, args.num_layers, compile_time
        )
        print(f"\n{'=' * 60}")
        print(f"✅ Complete!")
        print(f"  Compilation: {compile_time:.1f}s")
        print(f"  FHE inference: {server_time:.2f}s per token")
        print(f"  For 100 tokens: ~{server_time * 100 / 60:.1f} min")
        print(f"  Artifacts: {ARTIFACTS_DIR}")
        print(f"{'=' * 60}")
    else:
        # Just save
        from concrete.ml.deployment import FHEModelDev
        ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
        fhe_dev = FHEModelDev(ARTIFACTS_DIR, fhe_circuit)
        fhe_dev.save()
        print(f"\n✅ Saved to {ARTIFACTS_DIR}")


if __name__ == "__main__":
    main()
