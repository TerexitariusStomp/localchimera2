"""
Optimize FHE LLM artifacts for the deployed Akash GPU instance.

Compiles two-phase LFM2.5-230M with GPU acceleration and optional pruning,
then saves the best artifacts to a deployment directory.
"""
import modal
import time
import json
import shutil
import numpy as np
from pathlib import Path

APP_NAME = "fhe-llm-optimize"

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.1.0-devel-ubuntu22.04",
        add_python="3.10",
    )
    .apt_install(["libgmp-dev", "libmpfr-dev", "libmpc-dev", "cmake", "build-essential",
                  "pkg-config", "git", "wget"])
    .pip_install(
        "concrete-ml==1.9.0",
        "torch==2.3.1",
        "safetensors",
        "huggingface_hub",
        "numpy",
    )
    .run_commands(
        "pip uninstall -y concrete-python",
        "pip install --no-cache-dir concrete-python==2.10.0 --extra-index-url https://pypi.zama.ai/gpu --trusted-host pypi.zama.ai",
    )
)

app = modal.App(APP_NAME, image=image)
VOLUME = modal.Volume.from_name("fhe-artifacts", create_if_missing=True)


def _prune(weight, sp):
    import torch
    if sp == 0:
        return weight
    threshold = torch.quantile(torch.abs(weight), sp)
    pruned = weight.clone()
    pruned[torch.abs(pruned) < threshold] = 0
    return pruned


@app.function(gpu="A100", timeout=3600, volumes={"/artifacts": VOLUME})
def optimize():
    import torch
    import torch.nn as nn
    import subprocess
    import concrete.compiler
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file
    from concrete.ml.torch.compile import compile_torch_model
    from concrete.ml.deployment import FHEModelDev, FHEModelClient, FHEModelServer

    MODEL_ID = "LiquidAI/LFM2.5-230M"
    DEPLOY_DIR = Path("/artifacts")

    # Verify GPU
    result = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                          capture_output=True, text=True)
    print(f"GPU: {result.stdout.strip()}")
    print(f"GPU enabled: {concrete.compiler.check_gpu_enabled()}")
    print(f"GPU available: {concrete.compiler.check_gpu_available()}")

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

    np.random.seed(42)
    x_np = np.random.randn(1, hidden).astype(np.float32)
    x_t = torch.from_numpy(x_np)
    inter_np = np.random.randn(1, 1024 + inter).astype(np.float32)
    inter_t = torch.from_numpy(inter_np)

    def compile_and_test(module, name, input_shape, ref, test_input, out_dir,
                         n_bits=5, p_error=0.02, use_gpu=False):
        out_dir.mkdir(parents=True, exist_ok=True)
        for f in out_dir.iterdir():
            f.unlink()

        calib = torch.randn(*input_shape)
        kwargs = dict(n_bits=n_bits, p_error=p_error)
        if use_gpu:
            kwargs["device"] = "cuda"

        print(f"\n  Compiling {name} (gpu={use_gpu}, n_bits={n_bits}, p_error={p_error})...")
        t0 = time.time()
        circuit = compile_torch_model(module, calib, **kwargs)
        compile_time = time.time() - t0

        FHEModelDev(out_dir, circuit).save()

        client = FHEModelClient(out_dir)
        eval_keys = client.get_serialized_evaluation_keys()
        encrypted = client.quantize_encrypt_serialize(test_input)

        server = FHEModelServer(out_dir)
        try:
            _ = server.run(encrypted, eval_keys)
        except Exception:
            pass

        times = []
        for _ in range(3):
            t0 = time.time()
            enc_out = server.run(encrypted, eval_keys)
            times.append(time.time() - t0)

        inference_time = min(times)
        result = client.deserialize_decrypt_dequantize(enc_out)
        cos = np.dot(result.flatten(), ref.flatten()) / (
            np.linalg.norm(result) * np.linalg.norm(ref) + 1e-10
        )

        print(f"    compile={compile_time:.1f}s, inference={inference_time:.2f}s, cosine={cos:.4f}")
        return {
            "compile_time": compile_time,
            "inference_time": inference_time,
            "cosine": float(cos),
        }

    results = []

    # Phase 2 module (same for all sparsities)
    merged2 = torch.zeros(hidden * 2, 1024 + inter)
    merged2[:hidden, :1024] = w["o"]
    merged2[hidden:, 1024:] = w["w2"]
    ref2 = (inter_t @ merged2.T).numpy()
    mod2 = nn.Linear(1024 + inter, hidden * 2, bias=False)
    mod2.weight.data = merged2

    r2 = compile_and_test(mod2, "phase2", (1, 1024 + inter), ref2, inter_np,
                          DEPLOY_DIR / "gpu_opt_phase2", n_bits=5, p_error=0.02, use_gpu=True)

    # Phase 1 with different pruning / precision
    for sparsity in [0.0, 0.3, 0.5]:
        p1_w = torch.cat([w["q"], w["k"], w["v"], w["w1"], w["w3"]], dim=0)
        p1_w = _prune(p1_w, sparsity)
        mod1 = nn.Linear(hidden, p1_w.shape[0], bias=False)
        mod1.weight.data = p1_w
        ref1 = (x_t @ p1_w.T).numpy()
        nonzero = (p1_w != 0).sum().item() / p1_w.numel()

        label = f"phase1_sparsity_{int(sparsity*100)}"
        out_dir = DEPLOY_DIR / f"gpu_opt_{label}"
        r1 = compile_and_test(mod1, label, (1, hidden), ref1, x_np, out_dir,
                              n_bits=5, p_error=0.02, use_gpu=True)

        total = r1["inference_time"] + r2["inference_time"]
        quality = min(r1["cosine"], r2["cosine"])
        results.append({
            "sparsity": sparsity,
            "nonzero_pct": nonzero * 100,
            "phase1_time": r1["inference_time"],
            "phase2_time": r2["inference_time"],
            "total_time": total,
            "quality": quality,
            "tokens_per_min": 60 / total,
            "time_100_tokens_min": total * 100 / 60,
            "phase1_dir": str(out_dir),
            "phase2_dir": str(DEPLOY_DIR / "gpu_opt_phase2"),
        })

    # Pick best: highest tokens_per_min while quality >= 0.93
    best = None
    for r in results:
        if r["quality"] >= 0.93:
            if best is None or r["tokens_per_min"] > best["tokens_per_min"]:
                best = r

    if best is None:
        best = min(results, key=lambda r: r["total_time"])

    print("\n" + "=" * 60)
    print("OPTIMIZATION RESULTS")
    print("=" * 60)
    for r in results:
        print(f"  sparsity={r['sparsity']:>3.0%}: {r['total_time']:.2f}s/token, "
              f"quality={r['quality']:.4f}, {r['tokens_per_min']:.1f} tok/min")
    print("=" * 60)
    print(f"BEST: sparsity={best['sparsity']:.0%}, {best['total_time']:.2f}s/token, "
          f"{best['tokens_per_min']:.1f} tok/min, quality={best['quality']:.4f}")
    print("=" * 60)

    # Copy best artifacts to a deployable directory
    deploy_dir = DEPLOY_DIR / "gpu_opt_deploy"
    deploy_dir.mkdir(parents=True, exist_ok=True)
    for f in deploy_dir.iterdir():
        if f.is_dir():
            shutil.rmtree(f)
        else:
            f.unlink()

    (deploy_dir / "phase1").mkdir(exist_ok=True)
    (deploy_dir / "phase2").mkdir(exist_ok=True)
    for f in Path(best["phase1_dir"]).iterdir():
        shutil.copy2(f, deploy_dir / "phase1" / f.name)
    for f in Path(best["phase2_dir"]).iterdir():
        shutil.copy2(f, deploy_dir / "phase2" / f.name)

    metadata = {
        "model_id": MODEL_ID,
        "model_type": "lfm2_two_phase_fhe_gpu",
        "layer_index": 2,
        "hidden_size": hidden,
        "intermediate_size": inter,
        "n_bits": 5,
        "p_error": 0.02,
        "use_gpu": True,
        "best": best,
        "all_results": results,
    }
    with open(deploy_dir / "metadata.json", "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\nDeployable artifacts saved to: {deploy_dir}")
    VOLUME.commit()
    return best


if __name__ == "__main__":
    with app.run() as app_ctx:
        best = optimize.remote()
        print(f"\nOptimization complete: {best}")
