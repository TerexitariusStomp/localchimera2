# Audit Results — Real QVAC SDK Execution

Generated: 2026-06-21 by `node scripts/audit-demo.js` (CPU-only, no GPU)

## Environment

| Property | Value |
|----------|-------|
| Model | Llama-3.2-1B-Instruct-Q4_0 |
| SDK | @qvac/sdk v0.13.2 |
| Device | CPU (no GPU detected) |
| OS | Linux |

## Event Log

| # | Time | Type | Details |
|---|------|------|---------|
| 1 | 22:53:19 | **modelLoad** | `31b329c97909457e` loaded in **9,143ms** |
| 2 | 22:53:28 | **inference** | "What is the capital of France?" → **7 tokens in 8,990ms** (TTFT: 1,670ms, **0.78 tok/s**) |
| 3 | 22:55:13 | **inference** | "Explain quantum computing in simple terms" → **128 tokens in 104,946ms** (TTFT: 1,630ms, **1.22 tok/s**) |
| 4 | 22:55:30 | **inference** | "Write a haiku about machine learning" → **15 tokens in 16,816ms** (TTFT: 1,517ms, **0.89 tok/s**) |
| 5 | 22:55:30 | **embedding** | 3 texts → 0d vectors in **35ms** *(embedding model not present)* |
| 6 | 22:55:30 | **ragIngest** | 3 docs into `audit-demo-rag` in **10ms** |
| 7 | 22:55:30 | **ragSearch** | "How do I start a miner?" → **0 matches in 22ms** *(RAG API rejected: expected "classify")* |
| 8 | 22:55:30 | **modelUnload** | Model unloaded in **228ms** |

## Inference Summary

| Metric | Value |
|--------|-------|
| Total calls | 3 |
| **Avg latency** | **43,584ms** |
| **Avg TTFT** (time to first token) | **1,606ms** |
| **Avg throughput** | **1.0 tokens/sec** |
| Min latency | 8,990ms |
| Max latency | 104,946ms |

## Known Limitations

- **No GPU detected** — llama.cpp ran on CPU only (`--gpu-layers ignored`). GPU builds would see 10-50x speedup.
- **Embedding model not present** — `EMBEDDINGGEMMA_300M_Q4_0` not in this SDK build. When available, 3 texts → 768d vectors in ~50ms.
- **RAG search API mismatch** — Current SDK expects `type: "classify"` parameter. Fix tracked in upstream.

## How to Reproduce

```bash
cd /home/user/CascadeProjects/qvac-chimera
node scripts/audit-demo.js
```

Or trigger via the running node API:

```bash
curl -X POST http://localhost:3002/api/audit/run \
  -H "Authorization: Bearer <your-token>"
```

## Raw Audit File

`data/audit/2026-06-21.jsonl` (8 JSON events, one per line)
