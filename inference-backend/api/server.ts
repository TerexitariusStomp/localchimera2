import 'dotenv/config';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';
import {
  getNetworkStats,
  getNetworkUsage,
  getReferralAccount,
  applyReferralCode,
  createVM,
  listVMs,
  createContainer,
  listContainers,
} from './store.js';
import {
  createFHEJob,
  getFHEJob,
  setFHEResult,
  setFHEError,
  startFHEProcessor,
  listFHEJobsForAccount,
} from './fhe/store.js';

const PORT = parseInt(process.env.INFERENCE_API_PORT || '4000', 10);

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, headers);
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => resolve(body));
  });
}

const ZAMA_HOSTED_RELAYER_URL = 'https://relayer.testnet.zama.org/v2';
const RELAYER_URLS: Record<number, string> = {
  11155111: process.env.ZAMA_RELAYER_URL || ZAMA_HOSTED_RELAYER_URL,
  1: process.env.ZAMA_RELAYER_URL || ZAMA_HOSTED_RELAYER_URL,
};

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const path = url.pathname;

  try {
    const relayerMatch = path.match(/^\/api\/relayer\/(\d+)(.*)$/);
    if (relayerMatch) {
      const chainId = parseInt(relayerMatch[1], 10);
      const upstream = RELAYER_URLS[chainId];
      if (!upstream) {
        sendJson(res, 400, { error: 'Unsupported relayer chain' });
        return;
      }
      const useHosted = upstream === ZAMA_HOSTED_RELAYER_URL;
      const apiKey = process.env.ZAMA_RELAYER_API_KEY;
      if (useHosted && !apiKey) {
        sendJson(res, 500, { error: 'ZAMA_RELAYER_API_KEY not configured for Zama-hosted relayer' });
        return;
      }
      const upstreamPath = relayerMatch[2] || '/';
      const upstreamUrl = new URL(`${upstream}${upstreamPath}${url.search}`);
      const body = ['GET', 'HEAD'].includes(req.method || '') ? undefined : await readBody(req);
      const upstreamHeaders: Record<string, string> = {
        'content-type': req.headers['content-type'] || 'application/json',
      };
      if (useHosted && apiKey) {
        upstreamHeaders['x-api-key'] = apiKey;
      }
      const response = await fetch(upstreamUrl, {
        method: req.method || 'GET',
        headers: upstreamHeaders,
        body,
      });
      const responseBody = await response.text();
      res.writeHead(response.status, {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(responseBody);
      return;
    }

    if (path === '/health' && req.method === 'GET') {
      sendJson(res, 200, { status: 'ok', service: 'chimera-inference-api' });
      return;
    }

    if (path === '/api/network/stats' && req.method === 'GET') {
      sendJson(res, 200, await getNetworkStats());
      return;
    }

    const usageMatch = path.match(/^\/api\/network\/usage\/(.+)$/);
    if (usageMatch && req.method === 'GET') {
      sendJson(res, 200, await getNetworkUsage(decodeURIComponent(usageMatch[1])));
      return;
    }

    const referralMatch = path.match(/^\/api\/referrals\/(.+)$/);
    if (referralMatch && req.method === 'GET') {
      sendJson(res, 200, await getReferralAccount(decodeURIComponent(referralMatch[1])));
      return;
    }

    const historyMatch = path.match(/^\/api\/referrals\/(.+)\/history$/);
    if (historyMatch && req.method === 'GET') {
      const account = decodeURIComponent(historyMatch[1]);
      const data = await getReferralAccount(account);
      sendJson(res, 200, { account, history: data.history });
      return;
    }

    const applyMatch = path.match(/^\/api\/referrals\/(.+)\/apply$/);
    if (applyMatch && req.method === 'POST') {
      const account = decodeURIComponent(applyMatch[1]);
      const body = await readBody(req);
      const json = JSON.parse(body || '{}');
      const result = await applyReferralCode(account, String(json.code || ''));
      sendJson(res, result.success ? 200 : 409, result);
      return;
    }

    if (path === '/api/vms' && req.method === 'GET') {
      const account = decodeURIComponent(url.searchParams.get('account') || 'unknown');
      sendJson(res, 200, await listVMs(account));
      return;
    }

    if (path === '/api/vms' && req.method === 'POST') {
      const body = await readBody(req);
      const json = JSON.parse(body || '{}');
      const account = String(json.account || 'unknown');
      const vm = await createVM(account, {
        name: String(json.name || ''),
        image: String(json.image || ''),
        config: String(json.config || ''),
        sshKeyName: json.sshKeyName ? String(json.sshKeyName) : undefined,
        sshPublicKey: json.sshPublicKey ? String(json.sshPublicKey) : undefined,
        passwordHash: json.passwordHash ? String(json.passwordHash) : undefined,
      });
      sendJson(res, 201, vm);
      return;
    }

    if (path === '/api/containers' && req.method === 'GET') {
      const account = decodeURIComponent(url.searchParams.get('account') || 'unknown');
      sendJson(res, 200, await listContainers(account));
      return;
    }

    if (path === '/api/containers' && req.method === 'POST') {
      const body = await readBody(req);
      const json = JSON.parse(body || '{}');
      const account = String(json.account || 'unknown');
      const container = await createContainer(account, {
        name: String(json.name || ''),
        template: json.template ? String(json.template) : undefined,
        configType: json.configType === 'my' || json.configType === 'custom' ? json.configType : 'public',
        port: Number(json.port || 80),
        protocol: String(json.protocol || 'TCP'),
        envs: json.envs && typeof json.envs === 'object' ? json.envs : {},
        hardware: String(json.hardware || ''),
        scaling: json.scaling && typeof json.scaling === 'object' ? json.scaling : {},
      });
      sendJson(res, 201, container);
      return;
    }

    if (path === '/api/fhe/jobs' && req.method === 'POST') {
      const body = await readBody(req);
      const json = JSON.parse(body || '{}');
      const job = createFHEJob({
        accountHash: String(json.accountHash || 'unknown'),
        encryptedPrompt: String(json.encryptedPrompt || ''),
        publicKey: json.publicKey ? String(json.publicKey) : undefined,
        relinKeys: json.relinKeys ? String(json.relinKeys) : undefined,
        galoisKeys: json.galoisKeys ? String(json.galoisKeys) : undefined,
        circuit: json.circuit ? String(json.circuit) : undefined,
      });
      sendJson(res, 201, { jobId: job.jobId, status: job.status, circuit: job.circuit });
      return;
    }

    const fheJobMatch = path.match(/^\/api\/fhe\/jobs\/([^/]+)$/);
    if (fheJobMatch && req.method === 'GET') {
      const job = getFHEJob(decodeURIComponent(fheJobMatch[1]));
      if (!job) {
        sendJson(res, 404, { error: 'FHE job not found' });
        return;
      }
      sendJson(res, 200, job);
      return;
    }

    const fheResultGetMatch = path.match(/^\/api\/fhe\/jobs\/([^/]+)\/result$/);
    if (fheResultGetMatch && req.method === 'GET') {
      const job = getFHEJob(decodeURIComponent(fheResultGetMatch[1]));
      if (!job) {
        sendJson(res, 404, { error: 'FHE job not found' });
        return;
      }
      sendJson(res, 200, {
        jobId: job.jobId,
        status: job.status,
        encryptedResult: job.encryptedResult,
        error: job.error,
        completedAt: job.completedAt,
      });
      return;
    }

    const fheResultPostMatch = path.match(/^\/api\/fhe\/jobs\/([^/]+)\/result$/);
    if (fheResultPostMatch && req.method === 'POST') {
      const jobId = decodeURIComponent(fheResultPostMatch[1]);
      const body = await readBody(req);
      const json = JSON.parse(body || '{}');
      const encryptedResult = String(json.encryptedResult || '');
      if (!encryptedResult) {
        sendJson(res, 400, { error: 'encryptedResult is required' });
        return;
      }
      const ok = setFHEResult(jobId, encryptedResult);
      if (!ok) {
        sendJson(res, 404, { error: 'FHE job not found' });
        return;
      }
      sendJson(res, 200, { jobId, status: 'complete' });
      return;
    }

    if (path === '/api/fhe/jobs' && req.method === 'GET') {
      const account = decodeURIComponent(url.searchParams.get('account') || 'unknown');
      sendJson(res, 200, { account, jobs: listFHEJobsForAccount(account) });
      return;
    }

    // ─── ROMA task routing endpoint ───────────────────────────────
    // Accepts subtasks from ROMA (Recursive Open Meta-Agent) and routes
    // them to available Chimera tasking network nodes.
    //
    // POST /api/roma/task
    // { "goal": "...", "task_type": "RETRIEVE|WRITE|THINK|CODE_INTERPRET|IMAGE_GEN", "context": {...} }
    if (path === '/api/roma/task' && req.method === 'POST') {
      const body = await readBody(req);
      const json = JSON.parse(body || '{}');
      const goal = String(json.goal || '');
      if (!goal) {
        sendJson(res, 400, { error: 'Missing "goal" field' });
        return;
      }
      const taskType = String(json.task_type || 'THINK');
      const context = json.context || {};
      const callParams = json.call_params || {};

      // Route to Chimera container's local providers
      // The container runs all tasker network providers inline
      const startTime = Date.now();
      try {
        let output = '';
        let proof: string | undefined;

        // Map ROMA task type to Chimera provider
        const ROMA_TO_CHIMERA: Record<string, string> = {
          RETRIEVE: 'inference',
          WRITE: 'inference',
          THINK: 'inference',
          CODE_INTERPRET: 'compute',
          IMAGE_GEN: 'inference',
        };
        const chimeraType = ROMA_TO_CHIMERA[taskType] || 'inference';

        if (chimeraType === 'compute') {
          // Route to Golem/yagna for compute execution
          const code = context.code || goal;
          const runtime = context.runtime || 'shell';
          try {
            const { execSync } = await import('child_process');
            if (runtime === 'shell' || runtime === 'sh') {
              output = execSync(code, { timeout: 30000, encoding: 'utf8', maxBuffer: 1024 * 1024 });
            } else if (runtime === 'python') {
              output = execSync(`python3 -c "${code.replace(/"/g, '\\"')}"`, { timeout: 30000, encoding: 'utf8', maxBuffer: 1024 * 1024 });
            } else {
              output = execSync(`node -e "${code.replace(/"/g, '\\"')}"`, { timeout: 30000, encoding: 'utf8', maxBuffer: 1024 * 1024 });
            }
            proof = `compute:${runtime}:${Date.now()}`;
          } catch (e: any) {
            output = `Compute error: ${e.message}`;
          }
        } else {
          // Route to inference (vLLM/SGLang via BTT AI miner or local model)
          // Try the local inference endpoint first
          try {
            const inferRes = await fetch(`http://localhost:${PORT}/v1/chat/completions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{ role: 'user', content: goal }],
                model: context.model || 'chimera-local',
                max_tokens: callParams.max_tokens || 512,
                temperature: callParams.temperature ?? 0.7,
                stream: false,
              }),
            });
            if (inferRes.ok) {
              const inferJson = await inferRes.json();
              output = inferJson.choices?.[0]?.message?.content || '';
              proof = `inference:${Date.now()}`;
            } else {
              output = `Inference endpoint returned ${inferRes.status}`;
            }
          } catch (e: any) {
            output = `Inference not available: ${e.message}`;
          }
        }

        const elapsed = Date.now() - startTime;
        sendJson(res, 200, {
          output,
          sources: [],
          task_type: taskType,
          chimera_task_type: chimeraType === 'compute' ? 2 : 0,
          node_id: 'container',
          execution_time_ms: elapsed,
          proof,
        });
      } catch (e: any) {
        sendJson(res, 500, { error: e.message });
      }
      return;
    }

    // ROMA solve endpoint — full pipeline (atomize → plan → execute → aggregate → verify)
    if (path === '/api/roma/solve' && req.method === 'POST') {
      const body = await readBody(req);
      const json = JSON.parse(body || '{}');
      const goal = String(json.goal || '');
      if (!goal) {
        sendJson(res, 400, { error: 'Missing "goal" field' });
        return;
      }

      // Forward to Python ROMA service if available, otherwise use simple routing
      try {
        const romaRes = await fetch('http://localhost:8001/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal, ...json }),
        });
        if (romaRes.ok) {
          const romaJson = await romaRes.json();
          sendJson(res, 200, romaJson);
          return;
        }
      } catch {}

      // Fallback: single-step execution
      try {
        const taskRes = await fetch(`http://localhost:${PORT}/api/roma/task`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ goal, task_type: 'THINK', context: json.context || {} }),
        });
        const taskJson = await taskRes.json();
        sendJson(res, 200, { answer: taskJson.output, pipeline: 'fallback-single-step', ...taskJson });
      } catch (e: any) {
        sendJson(res, 500, { error: e.message });
      }
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`Chimera inference API listening on http://localhost:${PORT}`);
  const stopFHEProcessor = startFHEProcessor(1000);
  console.log('FHE inference processor started (1s poll)');
  process.on('SIGTERM', () => stopFHEProcessor());
  process.on('SIGINT', () => stopFHEProcessor());
});
