"""
Modal GPU benchmark for FULL LFM2.5-230M model.
Compiles all 14 layers (8 conv + 6 attention) to FHE and benchmarks on GPU.

Two strategies:
1. Per-layer circuits (42 FHE calls, real pipeline simulation)
2. Mega-circuit (all layers concatenated, tests GPU saturation)
"""
import modal
import time
import json
import numpy as np
from pathlib import Path

APP_NAME = "fhe-llm-full-model-gpu"

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.1.0-devel-ubuntu22.04",
        add_python="3.10",
    )
    .apt_install(["libgmp-dev", "libmpfr-dev", "libmpc-dev", "cmake", "build-essential",
                  "pkg-config", "git", "wget"])
    .pip_install(
        "concrete-ml",
        "torch",
        "safetensors",
        "huggingface_hub",
        "numpy",
    )
    .run_commands(
        "pip uninstall -y concrete-python",
    )
    .run_commands(
        "pip install concrete-python==2.10.0 --extra-index-url https://pypi.zama.ai/gpu --trusted-host pypi.zama.ai",
    )
)

app = modal.App(APP_NAME, image=image)
VOLUME = modal.Volume.from_name("fhe-artifacts", create_if_missing=True)

LAYER_TYPES = [
    "conv", "conv", "full_attention", "conv", "full_attention",
    "conv", "full_attention", "conv", "full_attention",
    "conv", "full_attention", "conv", "full_attention", "conv",
]


@app.function(gpu="A10G", timeout=3600, volumes={"/artifacts": VOLUME})
def benchmark_full_model():
    import torch
    import torch.nn as nn
    import numpy as np
    import time
    import json
    import gc
    from pathlib import Path
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file
    from concrete.ml.torch.compile import compile_torch_model
    from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer

    MODEL_ID = "LiquidAI/LFM2.5-230M"
    DEPLOY_DIR = Path("/artifacts")

    # Verify GPU
    import concrete.compiler
    gpu_enabled = concrete.compiler.check_gpu_enabled()
    gpu_available = concrete.compiler.check_gpu_available()
    print(f"GPU enabled: {gpu_enabled}, GPU available: {gpu_available}")
    assert gpu_enabled and gpu_available, "GPU not available!"

    import subprocess
    result = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                          capture_output=True, text=True)
    print(f"GPU: {result.stdout.strip()}")

    # Load model config
    config_path = hf_hub_download(MODEL_ID, "config.json")
    with open(config_path) as f:
        config = json.load(f)
    hidden = config["hidden_size"]      # 1024
    inter = config["intermediate_size"]  # 2560
    n_layers = config["num_hidden_layers"]  # 14

    print(f"\nModel: {MODEL_ID}")
    print(f"  Hidden: {hidden}, Intermediate: {inter}, Layers: {n_layers}")
    print(f"  Layer types: {LAYER_TYPES}")

    # Load all weights
    print("\nLoading all model weights...")
    path = hf_hub_download(MODEL_ID, "model.safetensors")
    all_weights = load_file(path)
    print(f"  Loaded {len(all_weights)} weight tensors")

    # ─── Build per-layer phase modules ───────────────────────────────────
    print("\nBuilding per-layer phase modules...")

    layer_modules = {}  # {layer_idx: {"p1": mod, "p2": mod, "p3": mod}}

    for i in range(n_layers):
        prefix = f"model.layers.{i}."
        ltype = LAYER_TYPES[i]

        if ltype == "conv":
            # Conv layer: in_proj (3072x1024), out_proj (1024x1024), w1, w2, w3
            in_proj = all_weights[f"{prefix}conv.in_proj.weight"].float()  # 3072x1024
            out_proj = all_weights[f"{prefix}conv.out_proj.weight"].float()  # 1024x1024
            w1 = all_weights[f"{prefix}feed_forward.w1.weight"].float()  # 2560x1024
            w2 = all_weights[f"{prefix}feed_forward.w2.weight"].float()  # 1024x2560
            w3 = all_weights[f"{prefix}feed_forward.w3.weight"].float()  # 2560x1024

            # Phase 1: in_proj + w1 + w3 (all take hidden input)
            p1_w = torch.cat([in_proj, w1, w3], dim=0)  # (3072+2560+2560)x1024 = 8192x1024
            mod_p1 = nn.Linear(hidden, p1_w.shape[0], bias=False)
            mod_p1.weight.data = p1_w

            # Phase 2: out_proj (takes 1024 input)
            mod_p2 = nn.Linear(hidden, hidden, bias=False)
            mod_p2.weight.data = out_proj

            # Phase 3: w2 (takes 2560 input)
            mod_p3 = nn.Linear(inter, hidden, bias=False)
            mod_p3.weight.data = w2

        else:  # full_attention
            # Attention layer: q, k, v, o_proj, w1, w2, w3
            q = all_weights[f"{prefix}self_attn.q_proj.weight"].float()  # 1024x1024
            k = all_weights[f"{prefix}self_attn.k_proj.weight"].float()  # 512x1024
            v = all_weights[f"{prefix}self_attn.v_proj.weight"].float()  # 512x1024
            o = all_weights[f"{prefix}self_attn.out_proj.weight"].float()  # 1024x1024
            w1 = all_weights[f"{prefix}feed_forward.w1.weight"].float()  # 2560x1024
            w2 = all_weights[f"{prefix}feed_forward.w2.weight"].float()  # 1024x2560
            w3 = all_weights[f"{prefix}feed_forward.w3.weight"].float()  # 2560x1024

            # Phase 1: q + k + v + w1 + w3 (all take hidden input)
            p1_w = torch.cat([q, k, v, w1, w3], dim=0)  # (1024+512+512+2560+2560)x1024 = 6656x1024
            mod_p1 = nn.Linear(hidden, p1_w.shape[0], bias=False)
            mod_p1.weight.data = p1_w

            # Phase 2: o_proj (takes 1024 input)
            mod_p2 = nn.Linear(hidden, hidden, bias=False)
            mod_p2.weight.data = o

            # Phase 3: w2 (takes 2560 input)
            mod_p3 = nn.Linear(inter, hidden, bias=False)
            mod_p3.weight.data = w2

        layer_modules[i] = {"p1": mod_p1, "p2": mod_p2, "p3": mod_p3, "type": ltype}
        print(f"  Layer {i} ({ltype}): p1_out={p1_w.shape[0]}, p2_out={hidden}, p3_out={hidden}")

    # ─── Strategy 1: Per-layer compilation + inference ──────────────────
    print("\n" + "=" * 70)
    print("STRATEGY 1: Per-layer circuits (42 FHE calls, real pipeline)")
    print("=" * 70)

    np.random.seed(42)
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
            out_dir = DEPLOY_DIR / "full_model" / tag
            out_dir.mkdir(parents=True, exist_ok=True)
            import shutil
            for f in out_dir.iterdir():
                if f.is_dir():
                    shutil.rmtree(f)
                else:
                    f.unlink()

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

            # Warmup
            try:
                _ = server.run(enc, ek)
            except:
                pass

            # Timed run
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

            # Cleanup to save memory
            del circuit, client, server
            gc.collect()

    total_compile = sum(compile_times)
    total_inference = sum(inference_times)
    min_cos = min(cosines)
    avg_inference = total_inference / len(inference_times)

    print(f"\n{'=' * 70}")
    print(f"STRATEGY 1 RESULTS (Per-layer, {n_layers * 3} FHE calls)")
    print(f"{'=' * 70}")
    print(f"  Total compile time: {total_compile:.1f}s ({total_compile/60:.1f} min)")
    print(f"  Total inference time: {total_inference:.2f}s/token")
    print(f"  Average per FHE call: {avg_inference:.2f}s")
    print(f"  Min cosine: {min_cos:.4f}")
    print(f"  100 tokens: {total_inference * 100 / 60:.1f} min")

    # ─── Strategy 2: Mega-circuit (all layers concatenated) ─────────────
    print("\n" + "=" * 70)
    print("STRATEGY 2: Mega-circuit (all layers concatenated, GPU saturation)")
    print("=" * 70)

    # Phase 1 mega: all layers' p1 weights concatenated
    all_p1_weights = []
    all_p2_weights = []
    all_p3_weights = []

    for i in range(n_layers):
        mods = layer_modules[i]
        all_p1_weights.append(mods["p1"].weight.data)
        all_p2_weights.append(mods["p2"].weight.data)
        all_p3_weights.append(mods["p3"].weight.data)

    # Phase 1 mega: all p1 take hidden input, concatenate outputs
    mega_p1_w = torch.cat(all_p1_weights, dim=0)
    mega_mod_p1 = nn.Linear(hidden, mega_p1_w.shape[0], bias=False)
    mega_mod_p1.weight.data = mega_p1_w
    print(f"  Mega Phase 1: {mega_p1_w.shape} ({mega_p1_w.shape[0]} output dims)")

    # Phase 2 mega: all p2 take hidden input, concatenate outputs
    mega_p2_w = torch.cat(all_p2_weights, dim=0)
    mega_mod_p2 = nn.Linear(hidden, mega_p2_w.shape[0], bias=False)
    mega_mod_p2.weight.data = mega_p2_w
    print(f"  Mega Phase 2: {mega_p2_w.shape} ({mega_p2_w.shape[0]} output dims)")

    # Phase 3 mega: all p3 take inter input, concatenate outputs
    mega_p3_w = torch.cat(all_p3_weights, dim=0)
    mega_mod_p3 = nn.Linear(inter, mega_p3_w.shape[0], bias=False)
    mega_mod_p3.weight.data = mega_p3_w
    print(f"  Mega Phase 3: {mega_p3_w.shape} ({mega_p3_w.shape[0]} output dims)")

    mega_results = {}

    for phase_name, mod, input_shape in [
        ("mega_p1", mega_mod_p1, (1, hidden)),
        ("mega_p2", mega_mod_p2, (1, hidden)),
        ("mega_p3", mega_mod_p3, (1, inter)),
    ]:
        tag = phase_name
        out_dir = DEPLOY_DIR / "full_model_mega" / tag
        out_dir.mkdir(parents=True, exist_ok=True)
        import shutil
        for f in out_dir.iterdir():
            if f.is_dir():
                shutil.rmtree(f)
            else:
                f.unlink()

        calib = torch.randn(*input_shape)
        test_input = np.random.randn(*input_shape).astype(np.float32)
        ref = (torch.from_numpy(test_input) @ mod.weight.data.T).numpy()

        print(f"\n  Compiling {tag} ({mod.weight.shape})...")
        t0 = time.time()
        try:
            circuit = compile_torch_model(mod, calib, n_bits=5, p_error=0.05,
                                          rounding_threshold_bits=3, device="cuda")
            ct = time.time() - t0

            FHEModelDev(out_dir, circuit).save()

            client = FHEModelClient(out_dir)
            ek = client.get_serialized_evaluation_keys()
            enc = client.quantize_encrypt_serialize(test_input)
            server = FHEModelServer(out_dir)

            # Warmup
            try:
                _ = server.run(enc, ek)
            except:
                pass

            # Timed run
            t0 = time.time()
            enc_out = server.run(enc, ek)
            it = time.time() - t0

            result = client.deserialize_decrypt_dequantize(enc_out)
            cos = np.dot(result.flatten(), ref.flatten()) / (
                np.linalg.norm(result) * np.linalg.norm(ref) + 1e-10)

            print(f"    compile={ct:.1f}s, inference={it:.2f}s, cosine={cos:.4f}")
            mega_results[tag] = {
                "compile_time": ct,
                "inference_time": it,
                "cosine": float(cos),
                "weight_shape": list(mod.weight.shape),
            }

            del circuit, client, server
            gc.collect()

        except Exception as e:
            ct = time.time() - t0
            print(f"    FAILED after {ct:.1f}s: {e}")
            mega_results[tag] = {"error": str(e), "compile_time": ct}

    mega_total = sum(r.get("inference_time", 0) for r in mega_results.values())
    mega_cos = min((r.get("cosine", 1.0) for r in mega_results.values() if "cosine" in r), default=0)

    print(f"\n{'=' * 70}")
    print(f"STRATEGY 2 RESULTS (Mega-circuit, 3 FHE calls)")
    print(f"{'=' * 70}")
    if mega_total > 0:
        print(f"  Total inference time: {mega_total:.2f}s/token")
        print(f"  Min cosine: {mega_cos:.4f}")
        print(f"  100 tokens: {mega_total * 100 / 60:.1f} min")
    else:
        print("  Mega-circuit compilation failed (likely too large for T4 memory)")

    # ─── Final Summary ──────────────────────────────────────────────────
    print(f"\n{'=' * 70}")
    print("FULL MODEL BENCHMARK SUMMARY")
    print(f"{'=' * 70}")
    print(f"  Model: {MODEL_ID} ({n_layers} layers, {hidden} hidden)")
    print(f"  Strategy 1 (per-layer, 42 calls): {total_inference:.2f}s/token, quality={min_cos:.4f}")
    if mega_total > 0:
        print(f"  Strategy 2 (mega, 3 calls):      {mega_total:.2f}s/token, quality={mega_cos:.4f}")
    print(f"  Local CPU single-layer baseline:  3.85s/token (x14 = ~53.9s for full model)")
    print(f"  Strategy 1 speedup vs CPU:        {53.9/total_inference:.1f}x" if total_inference > 0 else "")
    print(f"{'=' * 70}")

    # Save results
    results = {
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
        "strategy2_mega": mega_results,
    }

    with open(DEPLOY_DIR / "full_model_benchmark.json", "w") as f:
        json.dump(results, f, indent=2)

    VOLUME.commit()
    return results


if __name__ == "__main__":
    with app.run():
        print("\n=== Running Full Model GPU Benchmark ===\n")
        results = benchmark_full_model.remote()
        print(f"\nFull model benchmark complete!")

        # Print summary
        s1 = results["strategy1_per_layer"]
        print(f"\nStrategy 1 (per-layer, {s1['n_calls']} calls):")
        print(f"  Total inference: {s1['total_inference']:.2f}s/token")
        print(f"  Quality: {s1['min_cosine']:.4f}")
        print(f"  100 tokens: {s1['total_inference'] * 100 / 60:.1f} min")

        s2 = results.get("strategy2_mega", {})
        mega_total = sum(r.get("inference_time", 0) for r in s2.values() if isinstance(r, dict))
        if mega_total > 0:
            print(f"\nStrategy 2 (mega-circuit, 3 calls):")
            print(f"  Total inference: {mega_total:.2f}s/token")
