"""FHE inference server for Akash deployment.

Supports two-phase serving for the LFM2.5-230M model:
    /app/server_files/phase1/server.zip   # Phase 1: QKV + gate/up projections
    /app/server_files/phase2/server.zip   # Phase 2: output + down projections

Also supports the legacy single-model layout:
    /app/server_files/server.zip

The server never sees the client secret key; it only receives encrypted inputs
and evaluation keys, runs the FHE circuit, and returns encrypted outputs.
"""

import os
import base64
import time
from pathlib import Path
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import concrete.compiler
from concrete.ml.deployment import FHEModelServer, FHEModelClient
import numpy as np

app = FastAPI(title="Localchimera FHE Inference Server", version="0.2.0")

SERVER_DIR = Path(os.getenv("FHE_SERVER_DIR", "/app/server_files")).resolve()
CLIENT_DIR = Path(os.getenv("FHE_CLIENT_DIR", "/app/client_files")).resolve()

# Map phase name -> loaded FHEModelServer
servers: Dict[str, FHEModelServer] = {}
load_time: Optional[float] = None


def _load_phase_server(phase_dir: Path, phase_name: str) -> None:
    if not phase_dir.exists():
        raise FileNotFoundError(f"Server directory not found: {phase_dir}")
    srv = FHEModelServer(str(phase_dir))
    srv.load()
    servers[phase_name] = srv
    print(f"Loaded FHE model server for {phase_name} from {phase_dir}")


def _load_server() -> None:
    global load_time

    # Two-phase layout (LFM2.5-230M)
    phase1_dir = SERVER_DIR / "phase1"
    phase2_dir = SERVER_DIR / "phase2"
    if phase1_dir.exists() and phase2_dir.exists():
        _load_phase_server(phase1_dir, "phase1")
        _load_phase_server(phase2_dir, "phase2")
        load_time = time.time()
        return

    # Legacy single-model layout
    if SERVER_DIR.exists():
        srv = FHEModelServer(str(SERVER_DIR))
        srv.load()
        servers["single"] = srv
        load_time = time.time()
        print(f"Loaded single FHE model server from {SERVER_DIR}")
        return

    raise FileNotFoundError(f"No server artifact found in {SERVER_DIR}")


@app.on_event("startup")
async def startup() -> None:
    try:
        _load_server()
        print(f"GPU enabled: {concrete.compiler.check_gpu_enabled()}")
    except Exception as e:
        print(f"WARNING: failed to load server artifact: {e}")


class StatusResponse(BaseModel):
    status: str
    model: str
    gpu_enabled: bool
    server_loaded: bool
    available_phases: list
    load_time: Optional[float] = None


@app.get("/health", response_model=StatusResponse)
async def health() -> JSONResponse:
    gpu_enabled = False
    try:
        gpu_enabled = concrete.compiler.check_gpu_enabled()
    except Exception:
        pass
    return JSONResponse(
        content={
            "status": "ok",
            "model": os.getenv("FHE_MODEL_NAME", "unknown"),
            "gpu_enabled": gpu_enabled,
            "server_loaded": bool(servers),
            "available_phases": list(servers.keys()),
            "load_time": load_time,
        }
    )


class RunRequest(BaseModel):
    encrypted_input: str = Field(..., description="Base64-encoded encrypted input")
    evaluation_keys: str = Field(..., description="Base64-encoded serialized evaluation keys")
    phase: str = Field("single", description="Phase to run: single, phase1, or phase2")


class RunResponse(BaseModel):
    encrypted_output: str
    phase: str
    elapsed_ms: float


async def _run_fhe(req: RunRequest) -> JSONResponse:
    if req.phase not in servers:
        raise HTTPException(
            status_code=503,
            detail=f"Phase '{req.phase}' not loaded. Available: {list(servers.keys())}",
        )
    server = servers[req.phase]
    try:
        input_bytes = base64.b64decode(req.encrypted_input)
        eval_keys_bytes = base64.b64decode(req.evaluation_keys)

        t0 = time.time()
        result = server.run(input_bytes, eval_keys_bytes)
        elapsed_ms = (time.time() - t0) * 1000

        return JSONResponse(
            content={
                "encrypted_output": base64.b64encode(result).decode("ascii"),
                "phase": req.phase,
                "elapsed_ms": elapsed_ms,
            }
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"FHE execution failed: {e}") from e


@app.post("/run", response_model=RunResponse)
async def run_fhe(req: RunRequest) -> JSONResponse:
    return await _run_fhe(req)


@app.post("/run_raw")
async def run_fhe_raw(request: Request) -> JSONResponse:
    """Minimal endpoint that accepts a raw JSON body for non-Pydantic clients."""
    try:
        body = await request.json()
        req = RunRequest(
            encrypted_input=body["encrypted_input"],
            evaluation_keys=body["evaluation_keys"],
            phase=body.get("phase", "single"),
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid request body: {e}") from e
    return await _run_fhe(req)


# Cache clients for benchmark
_benchmark_clients: Dict[str, FHEModelClient] = {}


def _get_benchmark_client(phase: str) -> FHEModelClient:
    if phase in _benchmark_clients:
        return _benchmark_clients[phase]
    client_dir = CLIENT_DIR / phase
    if not client_dir.exists():
        raise FileNotFoundError(f"Client directory not found: {client_dir}")
    client = FHEModelClient(str(client_dir))
    _benchmark_clients[phase] = client
    return client


def _get_benchmark_shape(phase: str):
    """Read benchmark input shape from env, with sensible defaults."""
    import json
    default = {
        "phase1": (1, 1024),
        "phase2": (1, 1024),
        "single": (1, 1024),
    }
    env = os.getenv(f"FHE_BENCH_SHAPE_{phase.upper()}")
    if env:
        try:
            return tuple(json.loads(env))
        except Exception:
            pass
    return default.get(phase, (1, 1024))


def _benchmark_phase(phase: str, input_shape: tuple, iterations: int = 5):
    if phase not in servers:
        raise HTTPException(
            status_code=503,
            detail=f"Phase '{phase}' not loaded. Available: {list(servers.keys())}",
        )
    server = servers[phase]
    client = _get_benchmark_client(phase)
    eval_keys = client.get_serialized_evaluation_keys()
    test_input = np.random.randn(*input_shape).astype(np.float32)
    encrypted = client.quantize_encrypt_serialize(test_input)

    # Warmup
    try:
        _ = server.run(encrypted, eval_keys)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"FHE warmup failed: {e}") from e

    times = []
    for _ in range(iterations):
        t0 = time.time()
        _ = server.run(encrypted, eval_keys)
        times.append(time.time() - t0)

    return {
        "phase": phase,
        "input_shape": list(input_shape),
        "iterations": iterations,
        "avg_s": sum(times) / len(times),
        "min_s": min(times),
        "max_s": max(times),
    }


@app.get("/benchmark")
async def benchmark():
    """Self-contained benchmark: generate encrypted inputs and time server execution."""
    results = {}
    for phase in servers:
        results[phase] = _benchmark_phase(phase, _get_benchmark_shape(phase))

    total = sum(r["avg_s"] for r in results.values())
    tokens_per_min = 60 / total if total > 0 else 0
    return JSONResponse(
        content={
            "results": results,
            "total_avg_s": total,
            "tokens_per_min": tokens_per_min,
            "estimated_100_tokens_min": total * 100 / 60,
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
