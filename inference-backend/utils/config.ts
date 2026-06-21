import { config as loadEnv } from 'dotenv';
import { z } from 'zod';
import { NodeConfig } from '../types/index.js';

loadEnv();

const configSchema = z.object({
  CHIMERA_RPC_URL: z.string().url(),
  CHIMERA_CHAIN_ID: z.coerce.number().default(31337),
  PRIVATE_KEY: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
  COORDINATOR_WS_URL: z.string().url().startsWith('ws'),
  COORDINATOR_HTTP_URL: z.string().url(),
  NODE_NAME: z.string().min(1),
  NODE_REGION: z.string().min(1),
  NODE_CAPACITY_TOKENS_PER_SEC: z.coerce.number().positive(),
  NODE_MIN_PRICE_WEI: z.string().default('1000000000000'),
  NODE_STAKE_WEI: z.string().default('1000000000000000000'),
  MODEL_CACHE_DIR: z.string().default('./models/cache'),
  DEFAULT_MODEL: z.string().default('phi-3-mini-4k-instruct'),
  MODEL_FORMAT: z.enum(['gguf', 'onnx', 'wasm']).default('onnx'),
  INFERENCE_BACKEND: z.enum(['onnx', 'python', 'mock']).default('mock'),
  PYTHON_INFERENCE_URL: z.string().url().optional(),
  CONSENSUS_MIN_PEERS: z.coerce.number().min(2).default(3),
  CONSENSUS_MATCH_TIMEOUT_MS: z.coerce.number().default(30000),
  RANKING_WINDOW_SIZE: z.coerce.number().default(100),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  SENTRY_DSN: z.string().optional(),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid configuration:');
  parsed.error.errors.forEach((err: z.ZodIssue) => {
    console.error(`  ${err.path.join('.')}: ${err.message}`);
  });
  process.exit(1);
}

const env = parsed.data;

export const config: NodeConfig = {
  name: env.NODE_NAME,
  region: env.NODE_REGION,
  capacityTokensPerSec: env.NODE_CAPACITY_TOKENS_PER_SEC,
  minPriceWei: BigInt(env.NODE_MIN_PRICE_WEI),
  stakeWei: BigInt(env.NODE_STAKE_WEI),
  modelCacheDir: env.MODEL_CACHE_DIR,
  defaultModel: env.DEFAULT_MODEL,
  modelFormat: env.MODEL_FORMAT,
  inferenceBackend: env.INFERENCE_BACKEND,
  pythonInferenceUrl: env.PYTHON_INFERENCE_URL,
  consensusMinPeers: env.CONSENSUS_MIN_PEERS,
  consensusMatchTimeoutMs: env.CONSENSUS_MATCH_TIMEOUT_MS,
  rankingWindowSize: env.RANKING_WINDOW_SIZE,
};

export const networkConfig = {
  rpcUrl: env.CHIMERA_RPC_URL,
  chainId: env.CHIMERA_CHAIN_ID,
  wsUrl: env.COORDINATOR_WS_URL,
  coordinatorWsUrl: env.COORDINATOR_WS_URL,
  coordinatorHttpUrl: env.COORDINATOR_HTTP_URL,
  privateKey: env.PRIVATE_KEY,
};

export const logConfig = {
  level: env.LOG_LEVEL,
  format: env.LOG_FORMAT,
  sentryDsn: env.SENTRY_DSN,
};
