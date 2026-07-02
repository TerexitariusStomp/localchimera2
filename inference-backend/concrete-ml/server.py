"""
Concrete-ML FHE Server for the QVAC inference stack.

This server loads a compiled FHE model and serves encrypted inference requests.
It uses the standard Concrete-ML client/server deployment pattern:

- FHEModelServer loads server.zip (compiled FHE circuit)
- Client sends encrypted_input + evaluation_key
- Server runs the FHE circuit and returns encrypted_prediction

The server also provides endpoints for:
- /client.zip: Download client artifacts (for client-side encryption/decryption)
- /health: Health check
- /metadata: Model metadata (classes, features, etc.)

Usage:
    python server.py                          # Start server on port 8001
    python server.py --port 8001 --model-dir deployment/fhe_model
"""

import os
import base64
import argparse
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

from concrete.ml.deployment import FHEModelServer

DEFAULT_MODEL_DIR = os.path.join(os.path.dirname(__file__), "deployment", "fhe_model")
DEFAULT_PORT = 8001

# ─── Models ──────────────────────────────────────────────────────────────────

class PredictRequest(BaseModel):
    encrypted_input: str
    evaluation_key: str

# ─── Server ──────────────────────────────────────────────────────────────────

app = FastAPI(title="Concrete-ML FHE Inference Server", version="1.0.0")
fhe_model = None
model_dir = None


def load_model(model_dir_path: str):
    global fhe_model, model_dir
    model_dir = model_dir_path
    if not os.path.exists(model_dir_path):
        raise RuntimeError(
            f"Model directory not found: {model_dir_path}. "
            f"Run 'python model.py compile' first."
        )
    fhe_model = FHEModelServer(model_dir_path)
    print(f"FHE model loaded from {model_dir_path}")


@app.on_event("startup")
async def startup():
    global model_dir
    if fhe_model is None:
        load_model(model_dir or DEFAULT_MODEL_DIR)


@app.get("/")
def root():
    return {"message": "Concrete-ML FHE Inference Server", "status": "ok"}


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": fhe_model is not None}


@app.get("/metadata")
def metadata():
    import json
    meta_path = os.path.join(os.path.dirname(__file__), "deployment", "metadata.json")
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            return json.load(f)
    return {"error": "metadata not found"}


@app.get("/client.zip")
def get_client_artifacts():
    """Download client.zip for client-side encryption/decryption."""
    client_zip = os.path.join(model_dir, "client.zip")
    if not os.path.exists(client_zip):
        raise HTTPException(status_code=404, detail="client.zip not found")
    return FileResponse(client_zip, media_type="application/zip", filename="client.zip")


@app.post("/predict")
def predict(req: PredictRequest):
    """Run FHE inference on encrypted input."""
    if fhe_model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    try:
        encrypted_input = base64.b64decode(req.encrypted_input)
        evaluation_key = base64.b64decode(req.evaluation_key)
        prediction = fhe_model.run(encrypted_input, evaluation_key)
        encoded_prediction = base64.b64encode(prediction).decode()
        return {"encrypted_prediction": encoded_prediction}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    parser = argparse.ArgumentParser(description="Concrete-ML FHE Server")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--model-dir", type=str, default=DEFAULT_MODEL_DIR)
    parser.add_argument("--host", type=str, default="0.0.0.0")
    args = parser.parse_args()

    load_model(args.model_dir)
    print(f"Starting FHE server on {args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)
