#!/usr/bin/env node

/**
 * Model Benchmark CLI — standalone tool for benchmarking models.
 *
 * Inspired by Edge-AI-Nexus's benchmarking: measures TTFT, tokens/sec,
 * total latency, and memory usage across multiple prompts and models.
 *
 * Usage:
 *   node benchmark.js --model llama-3.2-1b-instruct --rounds 5
 *   node benchmark.js --all-models --rounds 3 --prompt "Explain quantum computing"
 *   node benchmark.js --model llama-3.2-1b-instruct --compare whisper-base
 *
 * Output: JSON report with per-model, per-prompt metrics.
 */

import { readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BENCHMARK_PROMPTS = [
  { id: 'short', prompt: 'What is 2+2?', maxTokens: 32, category: 'math' },
  { id: 'medium', prompt: 'Explain photosynthesis in 3 sentences.', maxTokens: 128, category: 'science' },
  { id: 'long', prompt: 'Write a Python function to compute the Fibonacci sequence. Include comments.', maxTokens: 256, category: 'code' },
  { id: 'reasoning', prompt: 'If a train leaves Boston at 3pm at 60mph and another leaves New York at 4pm at 80mph, when do they meet? Show your reasoning.', maxTokens: 256, category: 'reasoning' },
  { id: 'creative', prompt: 'Write a short poem about the ocean.', maxTokens: 128, category: 'creative' },
];

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    model: null,
    allModels: false,
    rounds: 3,
    prompt: null,
    compare: [],
    output: null,
    configPath: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--model': opts.model = args[++i]; break;
      case '--all-models': opts.allModels = true; break;
      case '--rounds': opts.rounds = parseInt(args[++i], 10) || 3; break;
      case '--prompt': opts.prompt = args[++i]; break;
      case '--compare': opts.compare.push(args[++i]); break;
      case '--output': opts.output = args[++i]; break;
      case '--config': opts.configPath = args[++i]; break;
      case '--help':
        console.log(`Usage: node benchmark.js [options]

Options:
  --model <name>       Model to benchmark
  --all-models         Benchmark all models from config
  --rounds <n>         Number of rounds per prompt (default: 3)
  --prompt <text>      Custom prompt to benchmark
  --compare <name>     Add a model to compare (repeatable)
  --output <path>      Save report to file (JSON)
  --config <path>      Path to config.json (default: ../config.json)
  --help               Show this help
`);
        process.exit(0);
    }
  }
  return opts;
}

async function loadConfig(configPath) {
  const defaultPath = join(__dirname, '..', 'config.json');
  const path = configPath || defaultPath;
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`Failed to load config from ${path}: ${e.message}`);
    return {};
  }
}

async function benchmarkModel(modelName, config, prompts, rounds) {
  console.log(`\nBenchmarking: ${modelName}`);

  let qvac = null;
  try {
    qvac = await import('@qvac/sdk');
  } catch (e) {
    console.error(`  Cannot load @qvac/sdk: ${e.message}`);
    return { model: modelName, error: e.message, results: [] };
  }

  const { loadModel, completion, unloadModel, LLAMA_3_2_1B_INST_Q4_0 } = qvac;
  const modelSrc = config.qvac?.modelConst || LLAMA_3_2_1B_INST_Q4_0;

  let modelId;
  try {
    console.log(`  Loading model...`);
    const loadStart = Date.now();
    modelId = await loadModel({
      modelSrc,
      modelType: 'llm',
      modelConfig: { device: 'cpu' },
      onProgress: (p) => { if (p.percent % 25 === 0) process.stdout.write(`\r  Load: ${p.percent}%`); },
    });
    const loadTime = Date.now() - loadStart;
    console.log(`\r  Loaded in ${loadTime}ms`);
  } catch (e) {
    console.error(`  Failed to load model: ${e.message}`);
    return { model: modelName, error: e.message, results: [] };
  }

  const results = [];

  for (const bench of prompts) {
    console.log(`  Prompt [${bench.category}]: "${bench.prompt.slice(0, 50)}..."`);
    const roundResults = [];

    for (let r = 0; r < rounds; r++) {
      try {
        const start = Date.now();
        let firstTokenTime = null;
        let output = '';

        const gen = completion({
          modelId,
          history: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: bench.prompt },
          ],
          stream: true,
          generationParams: {
            predict: bench.maxTokens,
            temp: 0.7,
          },
        });

        for await (const token of gen.tokenStream) {
          if (firstTokenTime === null) {
            firstTokenTime = Date.now();
          }
          output += token;
        }

        const totalTime = Date.now() - start;
        const ttft = firstTokenTime ? firstTokenTime - start : 0;
        const tokens = Math.ceil(output.length / 4);
        const tps = totalTime > 0 ? (tokens / (totalTime / 1000)).toFixed(2) : 0;

        roundResults.push({
          round: r + 1,
          ttftMs: ttft,
          totalTimeMs: totalTime,
          tokensGenerated: tokens,
          tokensPerSec: parseFloat(tps),
          outputLength: output.length,
        });

        process.stdout.write(`\r    Round ${r + 1}/${rounds}: TTFT=${ttft}ms, ${tps} tok/s`);
      } catch (e) {
        roundResults.push({ round: r + 1, error: e.message });
        process.stdout.write(`\r    Round ${r + 1}/${rounds}: ERROR: ${e.message}`);
      }
    }
    console.log('');

    // Compute averages
    const valid = roundResults.filter(r => !r.error);
    if (valid.length > 0) {
      const avg = {
        category: bench.category,
        promptId: bench.id,
        rounds: valid.length,
        avgTtftMs: Math.round(valid.reduce((s, r) => s + r.ttftMs, 0) / valid.length),
        avgTotalMs: Math.round(valid.reduce((s, r) => s + r.totalTimeMs, 0) / valid.length),
        avgTokens: Math.round(valid.reduce((s, r) => s + r.tokensGenerated, 0) / valid.length),
        avgTokensPerSec: parseFloat((valid.reduce((s, r) => s + r.tokensPerSec, 0) / valid.length).toFixed(2)),
        minTtftMs: Math.min(...valid.map(r => r.ttftMs)),
        maxTtftMs: Math.max(...valid.map(r => r.ttftMs)),
        rounds: roundResults,
      };
      results.push(avg);
      console.log(`    Avg: TTFT=${avg.avgTtftMs}ms, ${avg.avgTokensPerSec} tok/s, ${avg.avgTotalMs}ms total`);
    }
  }

  // Unload model
  try { await unloadModel({ modelId }); } catch {}

  const report = {
    model: modelName,
    timestamp: Date.now(),
    results,
    summary: {
      promptsRun: results.length,
      avgTtftMs: results.length > 0 ? Math.round(results.reduce((s, r) => s + r.avgTtftMs, 0) / results.length) : 0,
      avgTokensPerSec: results.length > 0
        ? parseFloat((results.reduce((s, r) => s + r.avgTokensPerSec, 0) / results.length).toFixed(2))
        : 0,
    },
  };

  return report;
}

async function main() {
  const opts = parseArgs();
  const config = await loadConfig(opts.configPath);

  let prompts = BENCHMARK_PROMPTS;
  if (opts.prompt) {
    prompts = [{ id: 'custom', prompt: opts.prompt, maxTokens: 256, category: 'custom' }];
  }

  let models = [];
  if (opts.allModels) {
    models = config.qvac?.models || ['llama-3.2-1b-instruct'];
  } else if (opts.model) {
    models = [opts.model];
  } else if (opts.compare.length > 0) {
    models = opts.compare;
  } else {
    models = [config.qvac?.models?.[0] || 'llama-3.2-1b-instruct'];
  }

  if (opts.compare.length > 0) {
    models = [...new Set([...models, ...opts.compare])];
  }

  console.log(`Chimera Model Benchmark`);
  console.log(`Models: ${models.join(', ')}`);
  console.log(`Rounds: ${opts.rounds} per prompt`);
  console.log(`Prompts: ${prompts.length}`);

  const allReports = [];
  for (const model of models) {
    const report = await benchmarkModel(model, config, prompts, opts.rounds);
    allReports.push(report);
  }

  // Comparison table
  if (allReports.length > 1) {
    console.log(`\n=== Comparison ===`);
    console.log(`${'Model'.padEnd(30)} ${'Avg TTFT'.padEnd(12)} ${'Avg tok/s'.padEnd(12)} ${'Prompts'.padEnd(8)}`);
    console.log(`${'-'.repeat(62)}`);
    for (const r of allReports) {
      const ttft = r.summary.avgTtftMs > 0 ? `${r.summary.avgTtftMs}ms` : 'N/A';
      const tps = r.summary.avgTokensPerSec > 0 ? r.summary.avgTokensPerSec : 'N/A';
      console.log(`${r.model.padEnd(30)} ${ttft.padEnd(12)} ${String(tps).padEnd(12)} ${String(r.summary.promptsRun).padEnd(8)}`);
    }
  }

  const fullReport = {
    timestamp: Date.now(),
    rounds: opts.rounds,
    models: allReports,
  };

  if (opts.output) {
    await writeFile(opts.output, JSON.stringify(fullReport, null, 2));
    console.log(`\nReport saved to: ${opts.output}`);
  } else {
    console.log(`\n${JSON.stringify(fullReport, null, 2)}`);
  }
}

main().catch(e => {
  console.error(`Benchmark failed: ${e.message}`);
  process.exit(1);
});
