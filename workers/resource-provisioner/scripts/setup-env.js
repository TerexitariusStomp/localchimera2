#!/usr/bin/env node
// Generate programmatic keys and merge them into .env.
import { randomBytes } from 'crypto';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { Wallet } from 'ethers';

const ENV_FILE = process.argv[2] || '.env';

function generateEvmPrivateKey() {
  return '0x' + randomBytes(32).toString('hex');
}

function generateGolemApiKey() {
  try {
    const name = `chimera-${Date.now()}`;
    const out = execSync(`yagna app-key create ${name}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    return { key: out.trim(), name };
  } catch (err) {
    return { error: 'Yagna is not installed or not running. Install yagna and run `yagna service run` first.' };
  }
}

const streamrPrivateKey = generateEvmPrivateKey();
const streamrAddress = new Wallet(streamrPrivateKey).address.toLowerCase();

const updates = {
  STREAMR_NODE_PRIVATE_KEY: streamrPrivateKey,
  STREAMR_STREAM_ID: `${streamrAddress}/chimera-telemetry`,
  STREAMR_API_URL: 'https://streamr.network/api',
};

const golem = generateGolemApiKey();
if (golem.key) {
  updates.GOLEM_API_KEY = golem.key;
}

let env = '';
if (existsSync(ENV_FILE)) {
  env = readFileSync(ENV_FILE, 'utf8');
}

for (const [key, value] of Object.entries(updates)) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}=${value}`;
  if (regex.test(env)) {
    env = env.replace(regex, line);
  } else {
    env += `\n${line}`;
  }
}

writeFileSync(ENV_FILE, env.trim() + '\n', 'utf8');
console.log(`Updated ${ENV_FILE} with generated keys.`);
if (golem.error) {
  console.log(`Note: ${golem.error}`);
}

console.log('\nNext steps:');
console.log(`1. Fund this Streamr address with POL on Polygon: ${streamrAddress}`);
console.log('2. Create the stream via https://streamr.network/ or the Streamr CLI:');
console.log(`   streamr stream create ${streamrAddress}/chimera-telemetry --private-key ${streamrPrivateKey}`);
console.log('3. Add remaining manual secrets (PRIVATE_KEY, Cloudflare, Edge Network, Namesilo).');

