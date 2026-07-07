"""Benchmark the compiled LFM2.5-230M FHE phases."""
import time
import numpy as np
from concrete.ml.deployment import FHEModelClient, FHEModelServer
from pathlib import Path

BASE = Path(__file__).parent / "deployment"

def benchmark_phase(phase_dir, input_shape, label):
    client = FHEModelClient(str(phase_dir))
    eval_keys = client.get_serialized_evaluation_keys()
    server = FHEModelServer(str(phase_dir))

    test_input = np.random.randn(*input_shape).astype(np.float32)
    encrypted = client.quantize_encrypt_serialize(test_input)

    # Warmup
    _ = server.run(encrypted, eval_keys)

    times = []
    for _ in range(5):
        t0 = time.time()
        result = server.run(encrypted, eval_keys)
        times.append(time.time() - t0)

    avg = sum(times) / len(times)
    print(f"{label}: avg={avg:.3f}s, min={min(times):.3f}s, max={max(times):.3f}s")
    return avg

phase1_avg = benchmark_phase(BASE / "lfm2_fhe_phase1", (1, 1024), "Phase 1")
phase2_avg = benchmark_phase(BASE / "lfm2_fhe_phase2", (1, 3584), "Phase 2")

per_token = phase1_avg + phase2_avg
per_100_min = per_token * 100 / 60
print(f"\nPer-token FHE: {per_token:.3f}s")
print(f"Estimated 100 tokens: {per_100_min:.1f} min")
