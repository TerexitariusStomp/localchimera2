#!/usr/bin/env node
import { marketApi } from '../src/api/marketApi.js';

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`
Chimera Market CLI — Request resources programmatically

Usage:
  node cli/market-cli.js <command> [options]

Commands:
  inference    --prompt "What is 2+2?" [--key /path/to/key.pem] [--amount 10]
  storage      --action allocate --space "myfiles" --size 100 [--key ...] [--amount 10]
  storage      --action store --space "myfiles" --hash <sha256> --size 1 [--key ...] [--amount 5]
  storage      --action retrieve --space "myfiles" --hash <sha256> [--key ...] [--amount 1]
  compute      --code "echo hello" [--runtime shell] [--cpu 2] [--ram 512] [--gpu] [--timeout 30] [--key ...] [--amount 10]
  bandwidth    --duration 1 --data 1 [--key ...] [--amount 5]
  status       --job <jobId>
  result       --job <jobId>

Examples:
  node cli/market-cli.js inference --prompt "Hello world" --key /tmp/latest_key.pem
  node cli/market-cli.js compute --code "echo hello" --key /tmp/latest_key.pem
  node cli/market-cli.js status --job "job:abc123:0"
`);
}

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : 'true';
      flags[key] = val;
    }
  }
  return flags;
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    usage();
    process.exit(0);
  }

  const flags = parseFlags(args.slice(1));
  const key = flags.key || process.env.CASPER_KEY_PEM || '/tmp/latest_key.pem';

  try {
    let result;
    switch (command) {
      case 'inference':
        if (!flags.prompt) { console.error('Missing --prompt'); process.exit(1); }
        result = await marketApi.createInferenceJob({ privateKeyPem: key, prompt: flags.prompt, amountCSPR: flags.amount || '10' });
        break;
      case 'storage':
        if (flags.action === 'allocate') {
          result = await marketApi.createStorageAllocation({ privateKeyPem: key, spaceName: flags.space, sizeMb: flags.size || '100', amountCSPR: flags.amount || '10' });
        } else if (flags.action === 'store') {
          result = await marketApi.createStorageFile({ privateKeyPem: key, spaceName: flags.space, fileHash: flags.hash, fileSizeMb: flags.size || '1', amountCSPR: flags.amount || '5' });
        } else if (flags.action === 'retrieve') {
          result = await marketApi.retrieveFile({ privateKeyPem: key, spaceName: flags.space, fileHash: flags.hash, amountCSPR: flags.amount || '1' });
        } else {
          console.error('Missing or invalid --action (allocate|store|retrieve)'); process.exit(1);
        }
        break;
      case 'compute':
        if (!flags.code) { console.error('Missing --code'); process.exit(1); }
        result = await marketApi.createComputeJob({ privateKeyPem: key, code: flags.code, runtime: flags.runtime || 'shell', cpuCores: flags.cpu || '2', ramMb: flags.ram || '512', gpu: flags.gpu === 'true', timeoutSec: flags.timeout || '30', amountCSPR: flags.amount || '10' });
        break;
      case 'bandwidth':
        result = await marketApi.createBandwidthJob({ privateKeyPem: key, durationHours: flags.duration || '1', dataAllowanceGb: flags.data || '1', amountCSPR: flags.amount || '5' });
        break;
      case 'status':
        if (!flags.job) { console.error('Missing --job'); process.exit(1); }
        result = await marketApi.getJobStatus(flags.job);
        break;
      case 'result':
        if (!flags.job) { console.error('Missing --job'); process.exit(1); }
        result = await marketApi.getJobResult(flags.job);
        break;
      default:
        console.error(`Unknown command: ${command}`);
        usage();
        process.exit(1);
    }
    console.log(JSON.stringify(result, null, 2));
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}

main();
