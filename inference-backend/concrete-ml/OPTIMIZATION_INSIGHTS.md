# FHE LLM Speed Optimization — Insights from Groq, Cerebras, and Concrete-ML

## Key Insights from Industry Leaders

### Groq LPU Architecture
1. **SRAM as primary storage** — weights on-chip, not in HBM. Eliminates memory latency.
2. **Static scheduling** — compiler pre-computes entire execution graph, no runtime overhead.
3. **Tensor parallelism** — split individual layers across processors for lower latency.
4. **TruePoint numerics** — mixed precision: FP32 for error-sensitive ops, FP8 for tolerant ones.
5. **Speculative decoding** — draft model predicts tokens, verify in batched forward pass.
6. **Pipeline parallelism** — Layer N+1 starts while Layer N finishes.

### Cerebras WSE
1. **Whole model on-chip** — 44GB SRAM, no external memory bottleneck.
2. **21 PB/s memory bandwidth** — 7000x H100, eliminates the memory wall.
3. **16-bit weights** — no quantization needed, full quality at speed.
4. **Layer-splitting for large models** — partition at layer boundaries across multiple WSEs.

### Concrete-ML FHE LLM
1. **Hybrid model** — linear layers in FHE (server), non-linear in plaintext (client).
2. **GPU gives ~30x speedup** — GPT2: 300s CPU → 11s GPU per token.
3. **Data transfer cost** — encrypted data is ~4x clear data size (GPT2: 2.2MB/token).
4. **Dynamic quantization** — `use_dynamic_quantization=True` for better accuracy.

## Applied Optimizations for Our FHE Pipeline

### 1. Tensor Parallelism (Groq-inspired)
**Insight**: Split individual Linear ops across multiple FHE circuits that run in parallel.
**Application**: Compile each projection (q/k/v/w1/w3) as a separate small FHE circuit.
Run them in parallel threads on the server. Each circuit is smaller → faster compilation
and inference. Merge results after decryption.

### 2. Mixed Precision (Groq TruePoint-inspired)
**Insight**: Use higher precision for error-sensitive layers, lower for tolerant ones.
**Application**: 
- Phase 1 (q/k/v projections): n_bits=6 (attention is sensitive to precision)
- Phase 2 (o_proj): n_bits=5 (output projection is more tolerant)
- Phase 3 (w2 MLP down): n_bits=4 (MLP is most tolerant to quantization)

### 3. Pipeline Parallelism (Groq-inspired)
**Insight**: Start next phase while previous phase is still running.
**Application**: Overlap FHE computation with client-side non-linear ops.
While server runs Phase 1 FHE, client can prepare Phase 2 input from previous token.

### 4. Speculative Decoding (Groq-inspired)
**Insight**: Draft model predicts multiple tokens, verify in batch.
**Application**: Client runs a small local model (e.g., 30M params) to predict 2-4 tokens.
Only send tokens that need FHE verification to the server. Accept tokens that match
the draft model's prediction, reducing FHE calls by 2-4x.

### 5. Weight Prefetching (Cerebras/FHE accelerator-inspired)
**Insight**: Keep weights in fast memory, prefetch next layer while current runs.
**Application**: Pre-load all FHE circuits into memory at server startup.
Cache evaluation keys client-side to avoid re-generation per token.

### 6. Dynamic Quantization (Concrete-ML)
**Insight**: `use_dynamic_quantization=True` adapts precision per-layer.
**Application**: Use Concrete-ML's built-in dynamic quantization instead of fixed n_bits.

### 7. Composed Linear Ops (algebraic optimization)
**Insight**: Merge sequential Linear ops (w2∘w3, o∘q) into single matmul.
**Application**: Pre-compute composed weight matrices. Trade: skips non-linear ops
between them, so only compose ops with no non-linear op between them.

## Expected Impact

| Optimization | Speedup Factor | Quality Impact |
|-------------|---------------|----------------|
| Tensor parallelism (5 threads) | 3-5x | None |
| Mixed precision (n_bits 6/5/4) | 1.3x | Minimal (<2%) |
| Pipeline overlap | 1.2x | None |
| Speculative decoding (2-4 tokens) | 2-4x | None |
| Weight prefetching | 1.1x | None |
| Composed Linear (selective) | 1.5x | Small (5-10%) |
| **Combined** | **~10-30x** | **<5% quality loss** |

On CPU: 3.95s → ~0.3-0.8s per token
On GPU: 3.95s → ~0.01-0.03s per token (with 30x GPU speedup)
