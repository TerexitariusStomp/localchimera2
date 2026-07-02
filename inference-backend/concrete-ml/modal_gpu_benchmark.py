"""
Modal GPU benchmark for FHE LLM optimization.
Runs the 3-phase FHE compilation on GPU and measures speedup vs CPU.
"""
import modal
import time
import json
import numpy as np
from pathlib import Path

APP_NAME = "fhe-llm-gpu-benchmark"

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


@app.function(gpu="T4", timeout=1800, volumes={"/artifacts": VOLUME})
def benchmark_gpu():
    import torch
    import torch.nn as nn
    import numpy as np
    import time
    import json
    from pathlib import Path
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file
    from concrete.ml.torch.compile import compile_torch_model
    from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer

    MODEL_ID = "LiquidAI/LFM2.5-230M"
    DEPLOY_DIR = Path("/artifacts")

    # Check GPU
    import subprocess
    result = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                          capture_output=True, text=True)
    gpu_info = result.stdout.strip()
    print(f"GPU: {gpu_info}")

    # Verify GPU support is available
    import concrete.compiler
    gpu_enabled = concrete.compiler.check_gpu_enabled()
    gpu_available = concrete.compiler.check_gpu_available()
    print(f"GPU enabled: {gpu_enabled}, GPU available: {gpu_available}")
    assert gpu_enabled, "GPU concrete-python not installed! Cannot benchmark GPU."
    assert gpu_available, "GPU not available on this machine!"

    import concrete.fhe
    print(f"Concrete FHE version: {concrete.fhe.__version__}")
    try:
        print(f"Concrete python version: {concrete.__version__}")
    except:
        pass

    # Load weights
    print("\nLoading model weights...")
    config_path = hf_hub_download(MODEL_ID, "config.json")
    with open(config_path) as f:
        config = json.load(f)
    hidden = config["hidden_size"]
    inter = config["intermediate_size"]

    path = hf_hub_download(MODEL_ID, "model.safetensors")
    weights = load_file(path)
    prefix = "model.layers.2."
    w = {k: weights[f"{prefix}{n}"].float() for k, n in {
        "q": "self_attn.q_proj.weight",
        "k": "self_attn.k_proj.weight",
        "v": "self_attn.v_proj.weight",
        "o": "self_attn.out_proj.weight",
        "w1": "feed_forward.w1.weight",
        "w2": "feed_forward.w2.weight",
        "w3": "feed_forward.w3.weight",
    }.items()}
    print(f"  Hidden: {hidden}, Intermediate: {inter}")

    # Build 3 phases
    p1_w = torch.cat([w["q"], w["k"], w["v"], w["w1"], w["w3"]], dim=0)
    mod1 = nn.Linear(hidden, p1_w.shape[0], bias=False)
    mod1.weight.data = p1_w

    mod2 = nn.Linear(hidden, hidden, bias=False)
    mod2.weight.data = w["o"]

    mod3 = nn.Linear(inter, hidden, bias=False)
    mod3.weight.data = w["w2"]

    np.random.seed(42)
    x_np = np.random.randn(1, hidden).astype(np.float32)
    x_t = torch.from_numpy(x_np)
    ref1 = (x_t @ p1_w.T).numpy()
    attn_in = np.random.randn(1, hidden).astype(np.float32)
    ref2 = (torch.from_numpy(attn_in) @ w["o"].T).numpy()
    mlp_in = np.random.randn(1, inter).astype(np.float32)
    ref3 = (torch.from_numpy(mlp_in) @ w["w2"].T).numpy()

    def compile_and_test(module, name, input_shape, ref, test_input, out_dir,
                         n_bits=5, p_error=0.05, rounding_threshold_bits=3,
                         use_gpu=False):
        out_dir.mkdir(parents=True, exist_ok=True)
        for f in out_dir.iterdir():
            f.unlink()

        calib = torch.randn(*input_shape)

        kwargs = dict(n_bits=n_bits, p_error=p_error,
                      rounding_threshold_bits=rounding_threshold_bits)
        if use_gpu:
            kwargs["device"] = "cuda"

        print(f"\n  Compiling {name} (gpu={use_gpu})...")
        t0 = time.time()
        circuit = compile_torch_model(module, calib, **kwargs)
        compile_time = time.time() - t0

        FHEModelDev(out_dir, circuit).save()

        client = FHEModelClient(out_dir)
        eval_keys = client.get_serialized_evaluation_keys()
        encrypted = client.quantize_encrypt_serialize(test_input)

        server = FHEModelServer(out_dir)

        # Warmup
        try:
            _ = server.run(encrypted, eval_keys)
        except:
            pass

        # Timed run
        t0 = time.time()
        enc_out = server.run(encrypted, eval_keys)
        inference_time = time.time() - t0

        # Second run for stable measurement
        t0 = time.time()
        enc_out = server.run(encrypted, eval_keys)
        inference_time2 = time.time() - t0

        fhe_result = client.deserialize_decrypt_dequantize(enc_out)
        cos = np.dot(fhe_result.flatten(), ref.flatten()) / (
            np.linalg.norm(fhe_result) * np.linalg.norm(ref) + 1e-10
        )

        print(f"  Compile: {compile_time:.1f}s")
        print(f"  Inference run 1: {inference_time:.2f}s")
        print(f"  Inference run 2: {inference_time2:.2f}s")
        print(f"  Cosine: {cos:.4f}")
        print(f"  Encrypted size: {len(encrypted)/1024:.0f}KB")

        return {
            "compile_time": compile_time,
            "inference_time_1": inference_time,
            "inference_time_2": inference_time2,
            "cosine": float(cos),
            "enc_size_kb": len(encrypted) / 1024,
        }

    results = {}

    # ─── GPU mode ────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("GPU MODE (T4 with device='cuda')")
    print("=" * 60)

    gpu_dir = DEPLOY_DIR / "gpu_bench_gpu"
    r_gpu_p1 = compile_and_test(mod1, "gpu_p1", (1, hidden), ref1, x_np, gpu_dir / "p1",
                                 use_gpu=True)
    r_gpu_p2 = compile_and_test(mod2, "gpu_p2", (1, hidden), ref2, attn_in, gpu_dir / "p2",
                                 use_gpu=True)
    r_gpu_p3 = compile_and_test(mod3, "gpu_p3", (1, inter), ref3, mlp_in, gpu_dir / "p3",
                                 use_gpu=True)
    gpu_total = r_gpu_p1["inference_time_2"] + r_gpu_p2["inference_time_2"] + r_gpu_p3["inference_time_2"]
    gpu_cos = min(r_gpu_p1["cosine"], r_gpu_p2["cosine"], r_gpu_p3["cosine"])
    results["gpu"] = {
        "total": gpu_total,
        "quality": gpu_cos,
        "phases": [r_gpu_p1, r_gpu_p2, r_gpu_p3],
    }
    print(f"\nGPU Total: {gpu_total:.2f}s/token, quality={gpu_cos:.4f}")

    # ─── Summary ─────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("GPU BENCHMARK RESULTS")
    print("=" * 60)
    print(f"  GPU (T4):  {gpu_total:.2f}s/token, quality={gpu_cos:.4f}")
    print(f"  100 tokens GPU: {gpu_total*100/60:.1f} min")
    print(f"  Local CPU baseline was: 3.85s/token, quality=0.935")
    if gpu_total > 0:
        print(f"  Speedup vs local CPU: {3.85/gpu_total:.1f}x")
    print("=" * 60)

    # Save results
    with open(DEPLOY_DIR / "gpu_benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)

    VOLUME.commit()
    return results


@app.function(gpu="T4", timeout=1800, volumes={"/artifacts": VOLUME})
def test_pruning():
    """Test weight pruning optimization on GPU."""
    import torch
    import torch.nn as nn
    import numpy as np
    import time
    import json
    from pathlib import Path
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file
    from concrete.ml.torch.compile import compile_torch_model
    from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer
    import concrete.fhe

    MODEL_ID = "LiquidAI/LFM2.5-230M"
    DEPLOY_DIR = Path("/artifacts")

    config_path = hf_hub_download(MODEL_ID, "config.json")
    with open(config_path) as f:
        config = json.load(f)
    hidden = config["hidden_size"]
    inter = config["intermediate_size"]

    path = hf_hub_download(MODEL_ID, "model.safetensors")
    weights = load_file(path)
    prefix = "model.layers.2."
    w = {k: weights[f"{prefix}{n}"].float() for k, n in {
        "q": "self_attn.q_proj.weight",
        "k": "self_attn.k_proj.weight",
        "v": "self_attn.v_proj.weight",
        "o": "self_attn.out_proj.weight",
        "w1": "feed_forward.w1.weight",
        "w2": "feed_forward.w2.weight",
        "w3": "feed_forward.w3.weight",
    }.items()}

    p1_w = torch.cat([w["q"], w["k"], w["v"], w["w1"], w["w3"]], dim=0)
    mod2 = nn.Linear(hidden, hidden, bias=False)
    mod2.weight.data = w["o"]
    mod3 = nn.Linear(inter, hidden, bias=False)
    mod3.weight.data = w["w2"]

    np.random.seed(42)
    x_np = np.random.randn(1, hidden).astype(np.float32)
    x_t = torch.from_numpy(x_np)
    ref1 = (x_t @ p1_w.T).numpy()
    attn_in = np.random.randn(1, hidden).astype(np.float32)
    ref2 = (torch.from_numpy(attn_in) @ w["o"].T).numpy()
    mlp_in = np.random.randn(1, inter).astype(np.float32)
    ref3 = (torch.from_numpy(mlp_in) @ w["w2"].T).numpy()

    results = {}

    for sparsity in [0.0, 0.3, 0.5, 0.7]:
        print(f"\n{'='*60}")
        print(f"Pruning sparsity={sparsity*100:.0f}%")
        print(f"{'='*60}")

        # Prune weights (set smallest to zero)
        def prune(weight, sp):
            if sp == 0:
                return weight
            threshold = torch.quantile(torch.abs(weight), sp)
            pruned = weight.clone()
            pruned[torch.abs(pruned) < threshold] = 0
            return pruned

        p1_pruned = prune(p1_w, sparsity)
        mod1 = nn.Linear(hidden, p1_pruned.shape[0], bias=False)
        mod1.weight.data = p1_pruned

        nonzero = (p1_pruned != 0).sum().item()
        total = p1_pruned.numel()
        print(f"  Non-zero weights: {nonzero}/{total} ({100*nonzero/total:.1f}%)")

        cfg = concrete.fhe.Configuration(use_gpu=True)
        out_dir = DEPLOY_DIR / f"prune_{int(sparsity*100)}"
        out_dir.mkdir(parents=True, exist_ok=True)
        import shutil
        for f in out_dir.iterdir():
            if f.is_dir():
                shutil.rmtree(f)
            else:
                f.unlink()

        calib = torch.randn(1, hidden)
        t0 = time.time()
        circuit = compile_torch_model(mod1, calib, n_bits=5, p_error=0.05,
                                      rounding_threshold_bits=3, device="cuda")
        ct = time.time() - t0
        FHEModelDev(out_dir / "p1", circuit).save()

        client = FHEModelClient(out_dir / "p1")
        ek = client.get_serialized_evaluation_keys()
        enc = client.quantize_encrypt_serialize(x_np)
        server = FHEModelServer(out_dir / "p1")

        # Warmup + timed
        try:
            _ = server.run(enc, ek)
        except:
            pass
        t0 = time.time()
        enc_out = server.run(enc, ek)
        it = time.time() - t0

        result = client.deserialize_decrypt_dequantize(enc_out)
        cos = np.dot(result.flatten(), ref1.flatten()) / (
            np.linalg.norm(result) * np.linalg.norm(ref1) + 1e-10)

        print(f"  Phase 1: compile={ct:.1f}s, inference={it:.2f}s, cosine={cos:.4f}")
        results[f"sparsity_{int(sparsity*100)}"] = {
            "compile_time": ct,
            "inference_time": it,
            "cosine": float(cos),
            "nonzero_pct": 100 * nonzero / total,
        }

    print(f"\n{'='*60}")
    print("PRUNING RESULTS")
    print(f"{'='*60}")
    for name, data in results.items():
        print(f"  {name}: {data['inference_time']:.2f}s, cosine={data['cosine']:.4f}")

    with open(DEPLOY_DIR / "pruning_results.json", "w") as f:
        json.dump(results, f, indent=2)

    VOLUME.commit()
    return results


if __name__ == "__main__":
    with app.run() as app_ctx:
        print("\n=== Running GPU Benchmark (T4) ===\n")
        gpu_results = benchmark_gpu.remote()
        print(f"\nGPU benchmark complete: {gpu_results}")

        print("\n=== Running Pruning Test ===\n")
        pruning_results = test_pruning.remote()
        print(f"\nPruning test complete: {pruning_results}")
