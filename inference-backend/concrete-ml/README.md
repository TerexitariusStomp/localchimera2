# Concrete-ML FHE Inference for Chimera

Integrates [Zama Concrete-ML](https://github.com/zama-ai/concrete-ml) for fully homomorphic encrypted (FHE) inference into the Chimera/QVAC inference stack.

## Architecture

```
┌──────────────┐     encrypted features      ┌─────────────────┐
│   Client     │ ──────────────────────────► │  FHE Server     │
│  (Python)    │                             │  (Concrete-ML)  │
│              │ ◄────────────────────────── │  classify input │
│  encrypt     │     encrypted prediction    │  (encrypted)    │
│  decrypt     │                             └────────┬────────┘
└──────┬───────┘                                      │
       │ plaintext prompt + intent                    │ intent (decrypted)
       ▼                                              ▼
┌──────────────────┐    generation     ┌─────────────────┐
│  QVAC Inference  │ ◄───────────────  │  FHEInference   │
│  Layer (LLM)     │    response       │  Layer (JS)     │
│  llama-3.2-1b    │                   │  routes based   │
└──────────────────┘                   │  on FHE intent  │
                                        └─────────────────┘
```

**Flow:**
1. Client encrypts prompt features using Concrete-ML client (`client.py`)
2. FHE server (`server.py`) classifies the encrypted input — **server never sees plaintext**
3. Client decrypts the classification result
4. Client sends plaintext prompt + intent to QVAC for LLM generation
5. QVAC generates response (LLM generation in FHE not yet feasible)

## Components

| File | Description |
|------|-------------|
| `model.py` | Train and compile FHE model (pluggable: TF-IDF or transformer features) |
| `server.py` | FastAPI server running the FHE circuit |
| `client.py` | Client library for encryption/decryption |
| `../qvac/src/inference/FHEInferenceLayer.js` | JS layer integrating FHE with QVAC inference |

## Quick Start

### 1. Install dependencies

```bash
cd inference-backend/concrete-ml
pip install -r requirements.txt
```

### 2. Train and compile the FHE model

```bash
python model.py compile                    # TF-IDF features (fast, no GPU needed)
python model.py compile --model transformer # Transformer embeddings (better quality)
```

This creates `deployment/fhe_model/client.zip` and `deployment/fhe_model/server.zip`.

### 3. Start the FHE server

```bash
python server.py --port 8001
```

### 4. Test encrypted inference

```bash
python client.py http://localhost:8001
```

### 5. Use with QVAC inference stack

The `FHEInferenceLayer` in `qvac/src/inference/FHEInferenceLayer.js` automatically
connects to the FHE server. It's initialized by `NodeManager` when `config.json`
has `inference.fhe.enabled: true`.

## Pluggable Model Design

The current model is a small XGBoost classifier (4 intent classes: question, creative, math, code).
The architecture is designed to swap in larger models as FHE hardware improves:

- **Now**: XGBoost on TF-IDF features (~1ms FHE inference)
- **Next**: XGBoost on transformer embeddings (~100ms FHE inference)
- **Future**: Small MLP/transformer in FHE (seconds-minutes)
- **Goal**: Full LLM generation in FHE (requires FHE hardware acceleration)

To add a new model, implement the training in `model.py` and the `FHEModelDev.save()` call
will handle the rest. The server and client don't need changes.

## Classes

| Index | Name | Example prompts |
|-------|------|-----------------|
| 0 | question | "how do i fix a bug", "what is blockchain" |
| 1 | creative | "write a poem", "create a story" |
| 2 | math | "calculate 15 * 27", "solve for x" |
| 3 | code | "write a python function", "create a react component" |
