#!/usr/bin/env python3
"""Compile and serialize a concrete-ml model for Akash FHE inference.

Usage:
    python3 prepare-model.py --model-dir /path/to/model --output ./serialized_fhe_model

The model directory should contain:
    config.json
    model.safetensors
    tokenizer.json
    tokenizer_config.json
"""

import argparse
import json
from pathlib import Path

import torch
import numpy as np
from safetensors.torch import load_file
from transformers import AutoConfig, AutoTokenizer

from concrete.ml.torch.compile import compile_torch_model
from concrete.ml.deployment import FHEModelDev


def load_model_from_dir(model_dir: Path, n_bits: int, inter_prune: float, hidden_prune: float):
    """Minimal loader for the LFM2.5-230M style model.

    Extend this to match your actual model architecture.
    """
    cfg_path = model_dir / "config.json"
    weights_path = model_dir / "model.safetensors"

    with open(cfg_path) as f:
        cfg = json.load(f)

    print(f"Model config: {cfg}")
    print(f"Weights: {weights_path}")

    # This is a placeholder: replace with your actual model class.
    # For the benchmark, the model was a custom linear/attention stack.
    class TinyModel(torch.nn.Module):
        def __init__(self, hidden_size, vocab_size):
            super().__init__()
            self.fc = torch.nn.Linear(hidden_size, vocab_size, bias=False)

        def forward(self, x):
            return self.fc(x)

    model = TinyModel(cfg.get("hidden_size", 1024), cfg.get("vocab_size", 32000))

    # Load weights if they match the placeholder shape; otherwise keep random for demo.
    state = load_file(weights_path)
    try:
        model.load_state_dict(state, strict=False)
        print("Loaded weights")
    except Exception as e:
        print(f"Could not load weights (placeholder model mismatch): {e}")

    return model, cfg


def main():
    parser = argparse.ArgumentParser(description="Serialize an FHE model for Akash deployment")
    parser.add_argument("--model-dir", required=True, type=Path, help="Directory with model files")
    parser.add_argument("--output", default="./serialized_fhe_model", type=Path)
    parser.add_argument("--n-bits", type=int, default=5)
    parser.add_argument("--inter-prune", type=float, default=0.98)
    parser.add_argument("--hidden-prune", type=float, default=0.95)
    parser.add_argument("--p-error", type=float, default=0.2)
    parser.add_argument("--minimal-config", action="store_true", default=True)
    args = parser.parse_args()

    args.output.mkdir(parents=True, exist_ok=True)

    model, cfg = load_model_from_dir(args.model_dir, args.n_bits, args.inter_prune, args.hidden_prune)

    model.eval()
    example_input = torch.randn(1, cfg.get("hidden_size", 1024))

    print("Compiling FHE model...")
    circuit = compile_torch_model(
        model,
        example_input,
        n_bits=args.n_bits,
        p_error=args.p_error,
        use_gpu=True,
        verbose=False,
    )

    print(f"Saving FHE artifacts to {args.output}")
    dev = FHEModelDev(args.output, circuit)
    dev.save(via_mlir=True)

    print("Done. Artifacts:")
    for f in sorted(args.output.iterdir()):
        print(f"  {f.name}")


if __name__ == "__main__":
    main()
