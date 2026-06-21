#!/usr/bin/env node
/**
 * Audit Logger Demo — synthetic run generating structured audit events.
 *
 * Simulates a Chimera node session:
 *   1. Model load
 *   2. Inference calls (various prompts, token counts, latencies)
 *   3. Embedding batch
 *   4. RAG ingest + search
 *   5. Model unload
 *
 * Output: data/audit/YYYY-MM-DD.jsonl (one JSON object per line)
 *
 * Run: node scripts/audit-demo.js
 * Inspect: cat data/audit/*.jsonl | head -20
 */
import { AuditLogger } from '../qvac/src/core/AuditLogger.js';
import { promises as fsp } from 'fs';
import path from 'path';

const MODEL = 'llama-3.2-1b-q4_0';

async function main() {
  const audit = new AuditLogger({ auditDir: path.join(process.cwd(), 'data', 'audit') });

  console.log('=== Chimera Audit Logger Demo ===\n');

  // 1. Model load
  const loadMs = 1243;
  audit.modelLoad({ modelId: MODEL, durationMs: loadMs, source: 'qvac-sdk' });
  console.log(`[modelLoad] ${MODEL} loaded in ${loadMs}ms`);

  // 2. Inference calls — varied prompts and performance
  const prompts = [
    { prompt: 'What is the capital of France?', tokens: 12, latency: 89 },
    { prompt: 'Explain quantum computing in simple terms', tokens: 156, latency: 420 },
    { prompt: 'Write a haiku about machine learning', tokens: 24, latency: 110 },
    { prompt: 'Summarize the theory of relativity', tokens: 98, latency: 315 },
    { prompt: 'Generate Python code for a Fibonacci sequence', tokens: 45, latency: 205 },
  ];

  for (const p of prompts) {
    audit.inference({
      prompt: p.prompt,
      outputTokens: p.tokens,
      durationMs: p.latency,
      ttftMs: Math.floor(p.latency * 0.15), // first token ~15% of total
      modelId: MODEL,
      source: 'llmwiki-ai-write',
      routeId: `demo-${Math.random().toString(36).substring(7)}`
    });
    const tps = (p.tokens / (p.latency / 1000)).toFixed(1);
    console.log(`[inference] "${p.prompt.slice(0, 40)}..." → ${p.tokens} tokens in ${p.latency}ms (${tps} tok/s)`);
  }

  // 3. Embedding batch
  const embedTexts = [
    'Chimera is a decentralized AI inference network',
    'Miners earn by providing GPU compute',
    'Smart contracts handle escrow and payouts',
  ];
  audit.embedding({ textCount: embedTexts.length, dimension: 768, durationMs: 67, modelId: 'embedding-gemma-300m-q4' });
  console.log(`[embedding] ${embedTexts.length} texts → 768d vectors in 67ms`);

  // 4. RAG ingest
  const docs = [
    { id: 'doc-1', text: 'Chimera architecture overview', metadata: { category: 'wiki' } },
    { id: 'doc-2', text: 'Miner setup guide for Ubuntu', metadata: { category: 'guide' } },
    { id: 'doc-3', text: 'Payout smart contract spec', metadata: { category: 'spec' } },
  ];
  audit.ragIngest({ docCount: docs.length, workspace: 'chimera-rag', durationMs: 145, modelId: 'embedding-gemma-300m-q4' });
  console.log(`[ragIngest] ${docs.length} docs into "chimera-rag" in 145ms`);

  // 5. RAG search
  audit.ragSearch({ query: 'How do I start a miner?', topK: 5, matchCount: 3, durationMs: 23, modelId: 'embedding-gemma-300m-q4' });
  console.log(`[ragSearch] "How do I start a miner?" → 3 matches in 23ms`);

  // 6. Model unload
  audit.modelUnload({ modelId: MODEL, source: 'qvac-sdk' });
  console.log(`[modelUnload] ${MODEL} unloaded`);

  // Flush and read back
  await audit.stop();

  const auditDir = path.join(process.cwd(), 'data', 'audit');
  const files = (await fsp.readdir(auditDir)).filter(f => f.endsWith('.jsonl')).sort();
  if (files.length === 0) {
    console.log('\nNo audit files generated.');
    return;
  }

  const latest = path.join(auditDir, files[files.length - 1]);
  const raw = await fsp.readFile(latest, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);

  console.log(`\n=== Audit file: ${latest} ===`);
  console.log(`Total events: ${lines.length}`);
  console.log('\n--- Sample events (first 3) ---\n');
  lines.slice(0, 3).forEach((line, i) => {
    const ev = JSON.parse(line);
    console.log(`${i + 1}. ${ev.type}`);
    console.log(JSON.stringify(ev, null, 2));
    console.log();
  });

  // Summary statistics
  const events = lines.map(l => JSON.parse(l));
  const inferences = events.filter(e => e.type === 'inference');
  if (inferences.length > 0) {
    const avgTps = inferences.reduce((s, e) => s + e.tokensPerSec, 0) / inferences.length;
    const avgLat = inferences.reduce((s, e) => s + e.durationMs, 0) / inferences.length;
    console.log('--- Inference Summary ---');
    console.log(`Calls: ${inferences.length}`);
    console.log(`Avg latency: ${avgLat.toFixed(0)}ms`);
    console.log(`Avg throughput: ${avgTps.toFixed(1)} tokens/sec`);
    console.log(`Min latency: ${Math.min(...inferences.map(e => e.durationMs))}ms`);
    console.log(`Max latency: ${Math.max(...inferences.map(e => e.durationMs))}ms`);
  }
}

main().catch(console.error);
