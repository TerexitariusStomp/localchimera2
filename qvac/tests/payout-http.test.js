/**
 * Payout API HTTP integration tests.
 *
 * Spins up a real WebServer with a real PayoutRouter backed by a temp
 * directory, sends actual HTTP requests, and verifies responses end-to-end.
 *
 * Run: node --test test/payout-http.test.js
 */
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import http from 'http';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { WebServer } from '../src/web/server.js';
import { PayoutRouter } from '../src/payout/PayoutRouter.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVM_DEV  = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const EVM_USER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

async function req(port, method, pathname, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const options = {
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Connection': 'close',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    };
    const r = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (payload) r.write(payload);
    r.end();
  });
}

describe('Payout API — HTTP integration', () => {
let server, httpServer, port, tmpDir;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-payout-http-'));
  const payoutRouter = new PayoutRouter({ rpcUrl: 'https://arb1.arbitrum.io/rpc', dataDir: tmpDir });
  server = new WebServer({ multisig: { rpcUrl: 'https://arb1.arbitrum.io/rpc' } });
  server.payoutRouter = payoutRouter;
  await server.initialize();
  httpServer = http.createServer((req, res) => server.handleRequest(req, res));
  await new Promise(resolve => httpServer.listen(0, '127.0.0.1', () => { port = httpServer.address().port; resolve(); }));
});

after(async () => {
  server.orchestrator.stop();
  httpServer.closeAllConnections?.();
  await new Promise(resolve => httpServer.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ── App registration ──────────────────────────────────────────────────────────

describe('POST /api/payout/register-app', () => {
  it('registers a valid app', async () => {
    const r = await req(port, 'POST', '/api/payout/register-app', {
      appId: 'app-http-1', name: 'HTTP Test App', developerEVM: EVM_DEV, feePercent: 0.25
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.equal(r.body.data.app.appId, 'app-http-1');
    assert.equal(r.body.data.app.feePercent, 0.25);
  });

  it('returns 400 for missing appId', async () => {
    const r = await req(port, 'POST', '/api/payout/register-app', { developerEVM: EVM_DEV });
    assert.equal(r.status, 400);
  });

  it('returns 400 for invalid EVM address', async () => {
    const r = await req(port, 'POST', '/api/payout/register-app', {
      appId: 'app-bad', developerEVM: 'not-an-address'
    });
    assert.equal(r.status, 400);
  });
});

// ── GET apps ──────────────────────────────────────────────────────────────────

describe('GET /api/payout/apps', () => {
  it('returns the registered app', async () => {
    const r = await req(port, 'GET', '/api/payout/apps');
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.data.apps.some(a => a.appId === 'app-http-1'));
  });
});

// ── User registration ─────────────────────────────────────────────────────────

describe('POST /api/payout/register-user', () => {
  it('registers a valid user', async () => {
    const r = await req(port, 'POST', '/api/payout/register-user', {
      userId: 'user-http-1', machineOwnerEVM: EVM_USER, appId: 'app-http-1'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.equal(r.body.data.user.userId, 'user-http-1');
    assert.equal(r.body.data.user.machineOwnerEVM, EVM_USER.toLowerCase());
  });

  it('returns 400 for unknown appId', async () => {
    const r = await req(port, 'POST', '/api/payout/register-user', {
      userId: 'user-http-2', machineOwnerEVM: EVM_USER, appId: 'no-such-app'
    });
    assert.equal(r.status, 400);
  });
});

// ── GET users ─────────────────────────────────────────────────────────────────

describe('GET /api/payout/users', () => {
  it('returns all users', async () => {
    const r = await req(port, 'GET', '/api/payout/users');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.users.some(u => u.userId === 'user-http-1'));
  });

  it('filters users by appId', async () => {
    const r = await req(port, 'GET', '/api/payout/users?appId=app-http-1');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.users.every(u => u.appId === 'app-http-1'));
  });
});

// ── Order recording ───────────────────────────────────────────────────────────

describe('POST /api/payout/record-order', () => {
  it('records a valid order', async () => {
    const r = await req(port, 'POST', '/api/payout/record-order', {
      orderId: 'ord-http-1', userId: 'user-http-1', appId: 'app-http-1',
      miner: 'casper', amount: 5.0
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.equal(r.body.data.order.amount, 5.0);
  });

  it('returns 400 for negative amount', async () => {
    const r = await req(port, 'POST', '/api/payout/record-order', {
      orderId: 'ord-http-neg', userId: 'user-http-1', appId: 'app-http-1',
      miner: 'casper', amount: -1
    });
    assert.equal(r.status, 400);
  });

  it('returns 400 for unknown user', async () => {
    const r = await req(port, 'POST', '/api/payout/record-order', {
      orderId: 'ord-http-ghost', userId: 'ghost', appId: 'app-http-1',
      miner: 'casper', amount: 1
    });
    assert.equal(r.status, 400);
  });
});

// ── GET orders ────────────────────────────────────────────────────────────────

describe('GET /api/payout/orders', () => {
  it('returns all orders', async () => {
    const r = await req(port, 'GET', '/api/payout/orders');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.orders.some(o => o.orderId === 'ord-http-1'));
  });

  it('filters by userId', async () => {
    const r = await req(port, 'GET', '/api/payout/orders?userId=user-http-1');
    assert.equal(r.status, 200);
    assert.ok(r.body.data.orders.every(o => o.userId === 'user-http-1'));
  });

  it('filters by year+month', async () => {
    const y = new Date().getUTCFullYear();
    const m = new Date().getUTCMonth() + 1;
    const r = await req(port, 'GET', `/api/payout/orders?year=${y}&month=${m}`);
    assert.equal(r.status, 200);
    assert.ok(r.body.data.orders.every(o => o.year === y && o.month === m));
  });
});

// ── Calculate ─────────────────────────────────────────────────────────────────

describe('GET /api/payout/calculate', () => {
  it('returns a manifest with correct split', async () => {
    const y = new Date().getUTCFullYear();
    const m = new Date().getUTCMonth() + 1;
    const r = await req(port, 'GET', `/api/payout/calculate?year=${y}&month=${m}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    const manifest = r.body.data.manifest;
    assert.ok(manifest.totalOrders >= 1);
    assert.ok(manifest.totalRevenue >= 5.0);
    const dist = manifest.distributions[0];
    assert.ok(Math.abs(dist.devAmount - dist.totalAmount * 0.25) < 0.001);
    assert.ok(Math.abs(dist.userAmount - dist.totalAmount * 0.75) < 0.001);
  });
});

// ── Manifest ──────────────────────────────────────────────────────────────────

describe('GET /api/payout/manifest', () => {
  it('returns the stored manifest', async () => {
    const y = new Date().getUTCFullYear();
    const m = new Date().getUTCMonth() + 1;
    const r = await req(port, 'GET', `/api/payout/manifest?year=${y}&month=${m}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.ok(r.body.data.manifest.totalRevenue >= 5.0);
  });
});

// ── Mark distributed → Deny → Confirm ────────────────────────────────────────

describe('distribution lifecycle via HTTP', () => {
  const y = 2025, m = 8;

  before(async () => {
    // Seed orders for this month
    const store = server.payoutRouter.store;
    const orders = await store.getOrders();
    orders[`ord-lifecycle-1`] = {
      orderId: 'ord-lifecycle-1', userId: 'user-http-1', appId: 'app-http-1',
      miner: 'golem', amount: 3, year: y, month: m, timestamp: Date.now()
    };
    await store.saveOrders();
    await req(port, 'GET', `/api/payout/calculate?year=${y}&month=${m}`);
  });

  it('POST /mark-distributed creates calculated status', async () => {
    const r = await req(port, 'POST', '/api/payout/mark-distributed', { year: y, month: m, txHash: null });
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    assert.equal(r.body.data.distribution.status, 'calculated');
  });

  it('POST /deny sets denied status within window', async () => {
    const r = await req(port, 'POST', '/api/payout/deny', {
      year: y, month: m, memberId: 'admin', reason: 'test denial'
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.distribution.status, 'denied');
    assert.equal(r.body.data.distribution.denials[0].memberId, 'admin');
  });

  it('POST /confirm sets confirmed with txHash', async () => {
    const fakeTx = '0x' + 'ab'.repeat(32);
    const r = await req(port, 'POST', '/api/payout/confirm', { year: y, month: m, txHash: fakeTx });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.distribution.status, 'confirmed');
    assert.equal(r.body.data.distribution.txHash, fakeTx);
  });
});

// ── Execute ───────────────────────────────────────────────────────────────────

describe('POST /api/payout/execute', () => {
  const y = 2025, m = 9;

  before(async () => {
    const store = server.payoutRouter.store;
    const orders = await store.getOrders();
    orders['ord-exec-1'] = {
      orderId: 'ord-exec-1', userId: 'user-http-1', appId: 'app-http-1',
      miner: 'casper', amount: 10, year: y, month: m, timestamp: Date.now()
    };
    await store.saveOrders();
    await req(port, 'GET', `/api/payout/calculate?year=${y}&month=${m}`);
    await req(port, 'POST', '/api/payout/mark-distributed', { year: y, month: m, txHash: null });
  });

  it('returns 400 when PAYOUT_SIGNING_KEY is absent', async () => {
    delete process.env.PAYOUT_SIGNING_KEY;
    const r = await req(port, 'POST', '/api/payout/execute', { year: y, month: m });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.includes('PAYOUT_SIGNING_KEY'));
  });

  it('returns 400 when distribution is already confirmed', async () => {
    const fakeTx = '0x' + 'cd'.repeat(32);
    // Manually confirm
    const store = server.payoutRouter.store;
    const dists = await store.getDistributions();
    const key = `${y}-${String(m).padStart(2, '0')}`;
    dists[key] = { ...dists[key], status: 'confirmed', txHash: fakeTx };
    await store.saveDistributions();

    const r = await req(port, 'POST', '/api/payout/execute', { year: y, month: m });
    assert.equal(r.status, 400);
    assert.ok(r.body.error.includes('confirmed'));
  });
});

// ── Stats ─────────────────────────────────────────────────────────────────────

describe('GET /api/payout/stats', () => {
  it('returns correct aggregate stats', async () => {
    const r = await req(port, 'GET', '/api/payout/stats');
    assert.equal(r.status, 200);
    assert.equal(r.body.success, true);
    const stats = r.body.data.stats;
    assert.ok(stats.appsRegistered >= 1);
    assert.ok(stats.usersRegistered >= 1);
    assert.ok(stats.totalOrders >= 1);
    assert.ok(stats.totalRevenue >= 5.0);
  });
});

// ── Route table coverage ──────────────────────────────────────────────────────

describe('route table includes execute', () => {
  it('POST /api/payout/execute is in ROUTES', async () => {
    const { matchRoute } = await import('../src/web/router.js');
    assert.equal(matchRoute('POST', '/api/payout/execute'), 'handlePayoutExecute');
  });
});

}); // end Payout API — HTTP integration
