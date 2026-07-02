"""
FHE LLM Benchmark — Full LFM2.5-230M model on GPU.
Runs on Golem GPU provider. Outputs results as JSON to stdout.
"""
import torch
import torch.nn as nn
import numpy as np
import time
import json
import gc
import subprocess
from pathlib import Path
from huggingface_hub import hf_hub_download
from safetensors.torch import load_file
from concrete.ml.torch.compile import compile_torch_model
from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer
import concrete.compiler

MODEL_ID = "LiquidAI/LFM2.5-230M"
LAYER_TYPES = [
    "conv", "conv", "full_attention", "conv", "full_attention",
    "conv", "full_attention", "conv", "full_attention",
    "conv", "full_attention", "conv", "full_attention", "conv",
]

def main():
    # Verify GPU
    print("Checking GPU...")
    result = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                          capture_output=True, text=True)
    print(f"GPU: {result.stdout.strip()}")

    gpu_enabled = concrete.compiler.check_gpu_enabled()
    gpu_available = concrete.compiler.check_gpu_available()
    print(f"GPU enabled: {gpu_enabled}, GPU available: {gpu_available}")

    if not gpu_enabled or not gpu_available:
        print("ERROR: GPU not available. Cannot run GPU benchmark.")
        return

    # Load config
    config_path = hf_hub_download(MODEL_ID, "config.json")
    with open(config_path) as f:
        config = json.load(f)
    hidden = config["hidden_size"]
    inter = config["intermediate_size"]
    n_layers = config["num_hidden_layers"]

    print(f"\nModel: {MODEL_ID}")
    print(f"  Hidden: {hidden}, Intermediate: {inter}, Layers: {n_layers}")

    # Load weights
    print("\nLoading model weights...")
    path = hf_hub_download(MODEL_ID, "model.safetensors")
    all_weights = load_file(path)

    # Build per-layer modules
    print("Building per-layer phase modules...")
    layer_modules = {}

    for i in range(n_layers):
        prefix = f"model.layers.{i}."
        ltype = LAYER_TYPES[i]

        if ltype == "conv":
            in_proj = all_weights[f"{prefix}conv.in_proj.weight"].float()
            out_proj = all_weights[f"{prefix}conv.out_proj.weight"].float()
            w1 = all_weights[f"{prefix}feed_forward.w1.weight"].float()
            w2 = all_weights[f"{prefix}feed_forward.w2.weight"].float()
            w3 = all_weights[f"{prefix}feed_forward.w3.weight"].float()

            p1_w = torch.cat([in_proj, w1, w3], dim=0)
            mod_p1 = nn.Linear(hidden, p1_w.shape[0], bias=False)
            mod_p1.weight.data = p1_w

            mod_p2 = nn.Linear(hidden, hidden, bias=False)
            mod_p2.weight.data = out_proj

            mod_p3 = nn.Linear(inter, hidden, bias=False)
            mod_p3.weight.data = w2
        else:
            q = all_weights[f"{prefix}self_attn.q_proj.weight"].float()
            k = all_weights[f"{prefix}self_attn.k_proj.weight"].float()
            v = all_weights[f"{prefix}self_attn.v_proj.weight"].float()
            o = all_weights[f"{prefix}self_attn.out_proj.weight"].float()
            w1 = all_weights[f"{prefix}feed_forward.w1.weight"].float()
            w2 = all_weights[f"{prefix}feed_forward.w2.weight"].float()
            w3 = all_weights[f"{prefix}feed_forward.w3.weight"].float()

            p1_w = torch.cat([q, k, v, w1, w3], dim=0)
            mod_p1 = nn.Linear(hidden, p1_w.shape[0], bias=False)
            mod_p1.weight.data = p1_w

            mod_p2 = nn.Linear(hidden, hidden, bias=False)
            mod_p2.weight.data = o

            mod_p3 = nn.Linear(inter, hidden, bias=False)
            mod_p3.weight.data = w2

        layer_modules[i] = {"p1": mod_p1, "p2": mod_p2, "p3": mod_p3, "type": ltype}

    # Compile and benchmark each layer
    np.random.seed(42)
    OUT_DIR = Path("/golem/work/fhe_artifacts")
    compile_times = []
    inference_times = []
    cosines = []

    for i in range(n_layers):
        ltype = LAYER_TYPES[i]
        mods = layer_modules[i]

        for phase_name, mod, input_shape in [
            ("p1", mods["p1"], (1, hidden)),
            ("p2", mods["p2"], (1, hidden)),
            ("p3", mods["p3"], (1, inter)),
        ]:
            tag = f"L{i}_{ltype}_{phase_name}"
            out_dir = OUT_DIR / tag
            out_dir.mkdir(parents=True, exist_ok=True)

            calib = torch.randn(*input_shape)
            test_input = np.random.randn(*input_shape).astype(np.float32)
            ref = (torch.from_numpy(test_input) @ mod.weight.data.T).numpy()

            print(f"\n  Compiling {tag}...")
            t0 = time.time()
            circuit = compile_torch_model(mod, calib, n_bits=5, p_error=0.05,
                                          rounding_threshold_bits=3, device="cuda")
            ct = time.time() - t0

            FHEModelDev(out_dir, circuit).save()

            client = FHEModelClient(out_dir)
            ek = client.get_serialized_evaluation_keys()
            enc = client.quantize_encrypt_serialize(test_input)
            server = FHEModelServer(out_dir)

            try:
                _ = server.run(enc, ek)
            except:
                pass

            t0 = time.time()
            enc_out = server.run(enc, ek)
            it = time.time() - t0

            result = client.deserialize_decrypt_dequantize(enc_out)
            cos = np.dot(result.flatten(), ref.flatten()) / (
                np.linalg.norm(result) * np.linalg.norm(ref) + 1e-10)

            print(f"    compile={ct:.1f}s, inference={it:.2f}s, cosine={cos:.4f}")
            compile_times.append(ct)
            inference_times.append(it)
            cosines.append(cos)

            del circuit, client, server
            gc.collect()

    total_compile = sum(compile_times)
    total_inference = sum(inference_times)
    min_cos = min(cosines)
    avg_inference = total_inference / len(inference_times)

    results = {
        "gpu": result.stdout.strip() if result else "unknown",
        "gpu_enabled": gpu_enabled,
        "model": MODEL_ID,
        "config": {"hidden": hidden, "intermediate": inter, "n_layers": n_layers},
        "strategy1_per_layer": {
            "total_compile": total_compile,
            "total_inference": total_inference,
            "avg_per_call": avg_inference,
            "min_cosine": min_cos,
            "n_calls": n_layers * 3,
            "per_call_times": inference_times,
            "per_call_cosines": cosines,
        },
    }

    print(f"\n{'='*60}")
    print(f"FULL MODEL GPU BENCHMARK RESULTS")
    print(f"{'='*60}")
    print(f"  Total inference: {total_inference:.2f}s/token")
    print(f"  Min cosine: {min_cos:.4f}")
    print(f"  100 tokens: {total_inference * 100 / 60:.1f} min")
    print(f"{'='*60}")

    with open("/golem/work/results.json", "w") as f:
        json.dump(results, f, indent=2)

    print(f"\nResults saved to /golem/work/results.json")


if __name__ == "__main__":
    main()
