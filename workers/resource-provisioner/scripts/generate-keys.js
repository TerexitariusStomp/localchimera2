#!/usr/bin/env node
// Generate keys/credentials that can be created programmatically.
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';
import { Wallet } from 'ethers';

function generateEvmPrivateKey() {
  return '0x' + randomBytes(32).toString('hex');
}

function generateGolemApiKey() {
  try {
    // Requires yagna daemon to be running locally.
    const name = `chimera-${Date.now()}`;
    const out = execSync(`yagna app-key create ${name}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return { key: out.trim(), name };
  } catch (err) {
    return { error: 'Yagna is not installed or not running. Install yagna and run `yagna service run` first.' };
  }
}

const streamrKey = generateEvmPrivateKey();
const streamrAddress = new Wallet(streamrKey).address.toLowerCase();
const golem = generateGolemApiKey();

console.log('\n# Generated credentials — add these to .env\n');
console.log(`STREAMR_NODE_PRIVATE_KEY=${streamrKey}`);
console.log(`STREAMR_STREAM_ID=${streamrAddress}/chimera-telemetry`);
if (golem.key) {
  console.log(`GOLEM_API_KEY=${golem.key}`);
} else {
  console.log(`# GOLEM_API_KEY=<generate via yagna after installing the daemon>`);
  console.log(`# ${golem.error}`);
}

console.log('\n# Fund the Streamr address with POL on Polygon, then create the stream via the Streamr CLI:');
console.log(`# streamr stream create ${streamrAddress}/chimera-telemetry --private-key ${streamrKey}`);
