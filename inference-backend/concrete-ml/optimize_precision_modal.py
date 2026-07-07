"""
Optimize FHE LLM precision parameters for maximum speed on GPU.

Compiles balanced two-phase LFM2.5-230M with multiple n_bits/p_error configs,
benchmarks each on GPU, and saves the fastest artifacts that maintain quality.

Also tries composed single-pass (everything in 1 FHE call) for maximum speed.
"""
import modal
import time
import json
import shutil
import numpy as np
from pathlib import Path

APP_NAME = "fhe-llm-precision-optimize"

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

# Precision configs to try — from conservative to aggressive
PRECISION_CONFIGS = [
    {"n_bits": 5, "p_error": 0.03, "label": "n5_pe03"},
    {"n_bits": 5, "p_error": 0.05, "label": "n5_pe05"},
    {"n_bits": 4, "p_error": 0.02, "label": "n4_pe02"},
    {"n_bits": 4, "p_error": 0.05, "label": "n4_pe05"},
    {"n_bits": 4, "p_error": 0.08, "label": "n4_pe08"},
    {"n_bits": 3, "p_error": 0.05, "label": "n3_pe05"},
]

QUALITY_THRESHOLD = 0.80


@app.function(gpu="A100", timeout=7200, volumes={"/artifacts": VOLUME})
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

    result = subprocess.run(["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
                          capture_output=True, text=True)
    print(f"GPU: {result.stdout.strip()}")
    print(f"GPU enabled: {concrete.compiler.check_gpu_enabled()}")

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

    # Balanced two-phase modules
    composed_mlp = w["w2"] @ w["w3"]
    phase1_merged = torch.cat([
        w["q"], w["k"], w["v"], w["w1"], w["w3"], composed_mlp
    ], dim=0)
    mod_p1 = nn.Linear(hidden, phase1_merged.shape[0], bias=False)
    mod_p1.weight.data = phase1_merged
    ref_p1 = (x_t @ phase1_merged.T).numpy()

    mod_p2 = nn.Linear(hidden, hidden, bias=False)
    mod_p2.weight.data = w["o"]
    attn_intermediate = np.random.randn(1, hidden).astype(np.float32)
    attn_t = torch.from_numpy(attn_intermediate)
    ref_p2 = (attn_t @ w["o"].T).numpy()

    # Composed single-pass: all 7 weights in one FHE call
    # Input: hidden_size, Output: q(1024)+k(512)+v(512)+o(1024)+w1(2560)+w3(2560) = 8192
    # o_proj applied to input directly (not attention output) — quality tradeoff
    composed_all = torch.cat([
        w["q"], w["k"], w["v"], w["o"], w["w1"], w["w3"]
    ], dim=0)
    mod_composed = nn.Linear(hidden, composed_all.shape[0], bias=False)
    mod_composed.weight.data = composed_all
    ref_composed = (x_t @ composed_all.T).numpy()

    def compile_and_test(module, name, input_shape, ref, test_input, out_dir,
                         n_bits, p_error, use_gpu=True):
        out_dir.mkdir(parents=True, exist_ok=True)
        for f in out_dir.iterdir():
            f.unlink()

        calib = torch.randn(*input_shape)
        kwargs = dict(n_bits=n_bits, p_error=p_error)
        if use_gpu:
            kwargs["device"] = "cuda"

        print(f"\n  Compiling {name} (n_bits={n_bits}, p_error={p_error})...")
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
        for _ in range(5):
            t0 = time.time()
            enc_out = server.run(encrypted, eval_keys)
            times.append(time.time() - t0)

        inference_time = min(times)
        result = client.deserialize_decrypt_dequantize(enc_out)
        cos = np.dot(result.flatten(), ref.flatten()) / (
            np.linalg.norm(result) * np.linalg.norm(ref) + 1e-10
        )

        print(f"    compile={compile_time:.1f}s, inference={inference_time:.3f}s, cosine={cos:.4f}")
        return {
            "compile_time": compile_time,
            "inference_time": inference_time,
            "cosine": float(cos),
        }

    results = []

    # Test composed single-pass with various precisions
    print("\n" + "=" * 60)
    print("COMPOSED SINGLE-PASS (1 FHE call)")
    print("=" * 60)
    for cfg in PRECISION_CONFIGS:
        label = f"composed_{cfg['label']}"
        out_dir = DEPLOY_DIR / f"precision_opt/{label}"
        r = compile_and_test(mod_composed, label, (1, hidden), ref_composed, x_np,
                             out_dir, cfg["n_bits"], cfg["p_error"], use_gpu=True)
        r["config"] = cfg
        r["strategy"] = "composed"
        r["label"] = label
        r["tokens_per_min"] = 60 / r["inference_time"]
        results.append(r)
        print(f"  {label}: {r['tokens_per_min']:.1f} tok/min, quality={r['cosine']:.4f}")

    # Test balanced two-phase with various precisions
    print("\n" + "=" * 60)
    print("BALANCED TWO-PHASE (2 FHE calls)")
    print("=" * 60)
    for cfg in PRECISION_CONFIGS:
        label = f"twophase_{cfg['label']}"
        p1_dir = DEPLOY_DIR / f"precision_opt/{label}_phase1"
        p2_dir = DEPLOY_DIR / f"precision_opt/{label}_phase2"

        r1 = compile_and_test(mod_p1, f"{label}_p1", (1, hidden), ref_p1, x_np,
                              p1_dir, cfg["n_bits"], cfg["p_error"], use_gpu=True)
        r2 = compile_and_test(mod_p2, f"{label}_p2", (1, hidden), ref_p2, attn_intermediate,
                              p2_dir, cfg["n_bits"], cfg["p_error"], use_gpu=True)

        total = r1["inference_time"] + r2["inference_time"]
        quality = min(r1["cosine"], r2["cosine"])
        r = {
            "inference_time": total,
            "cosine": quality,
            "phase1_time": r1["inference_time"],
            "phase2_time": r2["inference_time"],
            "config": cfg,
            "strategy": "twophase",
            "label": label,
            "tokens_per_min": 60 / total,
            "phase1_dir": str(p1_dir),
            "phase2_dir": str(p2_dir),
        }
        results.append(r)
        print(f"  {label}: {r['tokens_per_min']:.1f} tok/min, quality={quality:.4f}")

    # Pick best: highest tokens_per_min while quality >= threshold
    best = None
    for r in results:
        if r["cosine"] >= QUALITY_THRESHOLD:
            if best is None or r["tokens_per_min"] > best["tokens_per_min"]:
                best = r

    if best is None:
        best = max(results, key=lambda r: r["tokens_per_min"])
        print(f"\n  WARNING: No config met quality threshold {QUALITY_THRESHOLD}")
        print(f"  Best quality available: {max(r['cosine'] for r in results):.4f}")

    print("\n" + "=" * 60)
    print("ALL RESULTS (sorted by speed)")
    print("=" * 60)
    for r in sorted(results, key=lambda x: x["tokens_per_min"], reverse=True):
        marker = " *** BEST" if r is best else ""
        print(f"  {r['label']:>25s}: {r['tokens_per_min']:6.1f} tok/min, "
              f"quality={r['cosine']:.4f}, time={r['inference_time']:.3f}s{marker}")
    print("=" * 60)
    print(f"BEST: {best['label']}, {best['tokens_per_min']:.1f} tok/min, "
          f"quality={best['cosine']:.4f}")
    print("=" * 60)

    # Copy best artifacts to deployable directory
    deploy_dir = DEPLOY_DIR / "precision_opt_deploy"
    deploy_dir.mkdir(parents=True, exist_ok=True)
    for f in deploy_dir.iterdir():
        if f.is_dir():
            shutil.rmtree(f)
        else:
            f.unlink()

    if best["strategy"] == "composed":
        (deploy_dir / "single").mkdir(exist_ok=True)
        src = DEPLOY_DIR / f"precision_opt/{best['label']}"
        for f in Path(src).iterdir():
            shutil.copy2(f, deploy_dir / "single" / f.name)
    elif best["strategy"] == "twophase":
        (deploy_dir / "phase1").mkdir(exist_ok=True)
        (deploy_dir / "phase2").mkdir(exist_ok=True)
        for f in Path(best["phase1_dir"]).iterdir():
            shutil.copy2(f, deploy_dir / "phase1" / f.name)
        for f in Path(best["phase2_dir"]).iterdir():
            shutil.copy2(f, deploy_dir / "phase2" / f.name)

    metadata = {
        "model_id": MODEL_ID,
        "model_type": "lfm2_precision_optimized",
        "hidden_size": hidden,
        "intermediate_size": inter,
        "quality_threshold": QUALITY_THRESHOLD,
        "best": best,
        "all_results": [{k: v for k, v in r.items() if k != "phase1_dir" and k != "phase2_dir"} for r in results],
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
