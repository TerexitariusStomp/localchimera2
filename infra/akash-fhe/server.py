"""FHE inference server for Akash deployment.

Supports two-phase serving for the LFM2.5-230M model:
    /app/server_files/phase1/server.zip   # Phase 1: QKV + gate/up projections
    /app/server_files/phase2/server.zip   # Phase 2: output + down projections

Also supports tensor-parallel serving:
    /app/server_files/tp/<q|k|v|o|w1|w2|w3>/server.zip

And the legacy single-model layout:
    /app/server_files/server.zip

The server never sees the client secret key; it only receives encrypted inputs
and evaluation keys, runs the FHE circuit, and returns encrypted outputs.
"""

import os
import base64
import json
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Dict, List, Optional

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

# Tensor-parallel layout: circuit name -> loaded FHEModelServer
tp_servers: Dict[str, FHEModelServer] = {}
tp_circuits = ["q", "k", "v", "o", "w1", "w2", "w3"]


def _load_phase_server(phase_dir: Path, phase_name: str) -> None:
    if not phase_dir.exists():
        raise FileNotFoundError(f"Server directory not found: {phase_dir}")
    srv = FHEModelServer(str(phase_dir))
    srv.load()
    servers[phase_name] = srv
    print(f"Loaded FHE model server for {phase_name} from {phase_dir}")


def _load_tp_server(name: str) -> None:
    tp_dir = SERVER_DIR / "tp" / name
    if not tp_dir.exists():
        raise FileNotFoundError(f"Tensor-parallel server directory not found: {tp_dir}")
    srv = FHEModelServer(str(tp_dir))
    srv.load()
    tp_servers[name] = srv
    print(f"Loaded TP FHE model server for {name} from {tp_dir}")


def _load_server() -> None:
    global load_time

    # Tensor-parallel layout (LFM2.5-230M)
    tp_dir = SERVER_DIR / "tp"
    if tp_dir.exists():
        all_present = all((tp_dir / name).exists() for name in tp_circuits)
        if all_present:
            for name in tp_circuits:
                _load_tp_server(name)
            load_time = time.time()
            return

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
    available_tp_circuits: List[str]
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
            "server_loaded": bool(servers) or bool(tp_servers),
            "available_phases": list(servers.keys()),
            "available_tp_circuits": list(tp_servers.keys()),
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


class RunTPRequest(BaseModel):
    encrypted_inputs: List[str] = Field(..., description="Base64-encoded encrypted inputs, one per TP circuit")
    evaluation_keys: List[str] = Field(..., description="Base64-encoded eval keys, one per TP circuit")
    circuits: List[str] = Field(default_factory=lambda: tp_circuits, description="Circuit names to run")


class RunTPResponse(BaseModel):
    encrypted_outputs: List[str]
    circuits: List[str]
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


@app.post("/run_tp", response_model=RunTPResponse)
async def run_tp(req: RunTPRequest) -> JSONResponse:
    """Run tensor-parallel FHE circuits in parallel threads."""
    if not tp_servers:
        raise HTTPException(status_code=503, detail="Tensor-parallel circuits not loaded")

    for name in req.circuits:
        if name not in tp_servers:
            raise HTTPException(status_code=503, detail=f"TP circuit '{name}' not loaded")

    try:
        inputs = [base64.b64decode(x) for x in req.encrypted_inputs]
        eval_keys = [base64.b64decode(x) for x in req.evaluation_keys]
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid base64 payload: {e}") from e

    if len(inputs) != len(req.circuits) or len(eval_keys) != len(req.circuits):
        raise HTTPException(
            status_code=400,
            detail=f"Expected {len(req.circuits)} inputs and eval keys",
        )

    def run_one(name: str, inp: bytes, evk: bytes):
        t0 = time.time()
        out = tp_servers[name].run(inp, evk)
        return name, out, time.time() - t0

    t0 = time.time()
    with ThreadPoolExecutor(max_workers=len(req.circuits)) as executor:
        futures = [
            executor.submit(run_one, name, inp, evk)
            for name, inp, evk in zip(req.circuits, inputs, eval_keys)
        ]
        results = {}
        for fut in futures:
            name, out, dt = fut.result()
            results[name] = (out, dt)
    total_elapsed = (time.time() - t0) * 1000

    outputs = [base64.b64encode(results[name][0]).decode("ascii") for name in req.circuits]
    return JSONResponse(
        content={
            "encrypted_outputs": outputs,
            "circuits": req.circuits,
            "elapsed_ms": total_elapsed,
        }
    )


# Cache clients for benchmark
_benchmark_clients: Dict[str, FHEModelClient] = {}
_tp_benchmark_clients: Dict[str, FHEModelClient] = {}


def _get_benchmark_client(phase: str) -> FHEModelClient:
    if phase in _benchmark_clients:
        return _benchmark_clients[phase]
    client_dir = CLIENT_DIR / phase
    if not client_dir.exists():
        raise FileNotFoundError(f"Client directory not found: {client_dir}")
    client = FHEModelClient(str(client_dir))
    _benchmark_clients[phase] = client
    return client


def _get_tp_benchmark_client(name: str) -> FHEModelClient:
    if name in _tp_benchmark_clients:
        return _tp_benchmark_clients[name]
    client_dir = CLIENT_DIR / "tp" / name
    if not client_dir.exists():
        raise FileNotFoundError(f"TP client directory not found: {client_dir}")
    client = FHEModelClient(str(client_dir))
    _tp_benchmark_clients[name] = client
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


def _get_tp_benchmark_shape(name: str):
    """Read TP benchmark input shape from env, with sensible defaults."""
    import json
    # w2 takes intermediate-size input; everything else takes hidden-size input
    default = (1, 2560) if name == "w2" else (1, 1024)
    env = os.getenv(f"FHE_BENCH_SHAPE_TP_{name.upper()}")
    if env:
        try:
            return tuple(json.loads(env))
        except Exception:
            pass
    return default


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


def _benchmark_tp(circuits: List[str], iterations: int = 5):
    if not tp_servers:
        raise HTTPException(status_code=503, detail="Tensor-parallel circuits not loaded")

    # Generate encrypted inputs and eval keys for each circuit
    encrypted_inputs = []
    eval_keys_list = []
    for name in circuits:
        client = _get_tp_benchmark_client(name)
        shape = _get_tp_benchmark_shape(name)
        test_input = np.random.randn(*shape).astype(np.float32)
        encrypted_inputs.append(client.quantize_encrypt_serialize(test_input))
        eval_keys_list.append(client.get_serialized_evaluation_keys())

    # Warmup
    with ThreadPoolExecutor(max_workers=len(circuits)) as executor:
        futures = [
            executor.submit(tp_servers[name].run, encrypted_inputs[i], eval_keys_list[i])
            for i, name in enumerate(circuits)
        ]
        for fut in futures:
            fut.result()

    circuit_times = {name: [] for name in circuits}
    total_times = []
    for _ in range(iterations):
        t0 = time.time()
        with ThreadPoolExecutor(max_workers=len(circuits)) as executor:
            futures = [
                executor.submit(tp_servers[name].run, encrypted_inputs[i], eval_keys_list[i])
                for i, name in enumerate(circuits)
            ]
            for i, fut in enumerate(futures):
                name = circuits[i]
                t1 = time.time()
                fut.result()
                circuit_times[name].append(time.time() - t1)
        total_times.append(time.time() - t0)

    results = {}
    for name in circuits:
        results[name] = {
            "avg_s": sum(circuit_times[name]) / len(circuit_times[name]),
            "min_s": min(circuit_times[name]),
            "max_s": max(circuit_times[name]),
        }

    return {
        "circuits": results,
        "total_avg_s": sum(total_times) / len(total_times),
        "total_min_s": min(total_times),
        "total_max_s": max(total_times),
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


@app.get("/benchmark_tp")
async def benchmark_tp():
    """Self-contained benchmark for tensor-parallel circuits."""
    circuits = list(tp_servers.keys()) or tp_circuits
    data = _benchmark_tp(circuits)
    total = data["total_avg_s"]
    tokens_per_min = 60 / total if total > 0 else 0
    return JSONResponse(
        content={
            "circuits": data["circuits"],
            "total_avg_s": total,
            "tokens_per_min": tokens_per_min,
            "estimated_100_tokens_min": total * 100 / 60,
        }
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)
