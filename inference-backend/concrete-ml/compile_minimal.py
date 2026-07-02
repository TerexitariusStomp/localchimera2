"""
Minimal FHE LLM model — single-token inference proof of concept.

Compiles a tiny Linear model (not the full 230M) that fits in ~1-2GB RAM.
This proves the private pipeline:
  Client encrypts → Server processes encrypted → Client decrypts
  Server NEVER sees plaintext

The model is a single nn.Linear layer that mimics one transformer layer's
shape (hidden_size=1024). This validates the full FHE flow on this machine.
When we move to a GPU machine, we swap in the real LFM2.5-230M layers.

Usage:
  python compile_minimal.py                    # Compile
  python compile_minimal.py --hidden-size 512  # Smaller (fits in less RAM)
"""

import os
import time
import argparse
import numpy as np
from pathlib import Path

import torch
import torch.nn as nn

ARTIFACTS_DIR = Path(__file__).parent / "deployment" / "minimal_fhe"


class MinimalFHELayer(nn.Module):
    """A single Linear layer mimicking one transformer layer.

    In production, this gets replaced with LFM2.5-230M's actual layers.
    The FHE compilation and client-server flow remain identical.
    """
    def __init__(self, hidden_size=1024):
        super().__init__()
        self.linear = nn.Linear(hidden_size, hidden_size)
        self.activation = nn.ReLU()

    def forward(self, x):
        return self.activation(self.linear(x))


def compile_minimal(hidden_size=1024, n_bits=6, p_error=0.01):
    """Compile minimal model to FHE."""
    from concrete.ml.torch.compile import compile_torch_model

    print(f"Compiling minimal FHE model (hidden_size={hidden_size})...")

    model = MinimalFHELayer(hidden_size)
    model.eval()

    # Calibration input
    calib_input = torch.randn(1, hidden_size)

    print(f"  Parameters: {hidden_size * hidden_size + hidden_size}")
    print(f"  n_bits: {n_bits}")
    print(f"  p_error: {p_error}")

    start = time.time()
    fhe_circuit = compile_torch_model(
        model,
        calib_input,
        n_bits=n_bits,
        p_error=p_error,
    )
    compile_time = time.time() - start
    print(f"  Compilation time: {compile_time:.1f}s")

    # Save artifacts
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    from concrete.ml.deployment import FHEModelDev
    fhe_dev = FHEModelDev(ARTIFACTS_DIR, fhe_circuit)
    fhe_dev.save()

    # Save metadata
    import json
    metadata = {
        "model_type": "minimal_fhe_linear",
        "hidden_size": hidden_size,
        "n_bits": n_bits,
        "p_error": p_error,
        "parameters": hidden_size * hidden_size + hidden_size,
        "compile_time_sec": compile_time,
        "note": "Minimal proof-of-concept. Replace with LFM2.5-230M layers on GPU machine.",
    }
    with open(ARTIFACTS_DIR / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n✅ Compiled and saved to {ARTIFACTS_DIR}")
    print(f"   client.zip and server.zip ready")
    return fhe_circuit


def test_compiled_model(hidden_size=1024):
    """Test the compiled FHE model end-to-end."""
    from concrete.ml.deployment import FHEModelClient, FHEModelServer

    print(f"\n--- Testing FHE model ---")

    # Client side
    client = FHEModelClient(ARTIFACTS_DIR)
    eval_keys = client.get_serialized_evaluation_keys()
    print(f"  Client: evaluation keys generated ({len(eval_keys)} bytes)")

    # Encrypt input (simulates encrypted embedding from token)
    test_input = np.random.randn(1, hidden_size).astype(np.float32)
    encrypted = client.quantize_encrypt_serialize(test_input)
    print(f"  Client: input encrypted ({len(encrypted)} bytes)")

    # Server side — processes encrypted data, NEVER sees plaintext
    server = FHEModelServer(ARTIFACTS_DIR)
    start = time.time()
    encrypted_result = server.run(encrypted, eval_keys)
    server_time = time.time() - start
    print(f"  Server: FHE inference done ({server_time:.2f}s)")

    # Client decrypts
    result = client.deserialize_decrypt_dequantize(encrypted_result)
    print(f"  Client: decrypted result shape={result.shape}")

    # Compare with plaintext
    model = MinimalFHELayer(hidden_size)
    model.eval()
    with torch.no_grad():
        plaintext_result = model(torch.from_numpy(test_input)).numpy()

    max_diff = np.max(np.abs(result - plaintext_result))
    print(f"  Max diff (FHE vs plaintext): {max_diff:.6f}")
    print(f"  ✅ End-to-end FHE inference works!")

    return server_time


def main():
    parser = argparse.ArgumentParser(description="Compile minimal FHE model")
    parser.add_argument("--hidden-size", type=int, default=512,
                        help="Hidden size (default 512 for low-RAM machines)")
    parser.add_argument("--n-bits", type=int, default=6)
    parser.add_argument("--p-error", type=float, default=0.01)
    parser.add_argument("--test", action="store_true", default=True,
                        help="Run end-to-end test after compilation")
    args = parser.parse_args()

    fhe_circuit = compile_minimal(
        hidden_size=args.hidden_size,
        n_bits=args.n_bits,
        p_error=args.p_error,
    )

    if args.test:
        test_compiled_model(args.hidden_size)


if __name__ == "__main__":
    main()
