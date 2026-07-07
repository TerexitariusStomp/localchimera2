/**
 * PayoutRouter integration tests.
 * Exercises real code paths against a real temp-dir PayoutStore.
 * Run: node --test test/payout.test.js
 */
import assert from 'node:assert/strict';
import { describe, it, before, after, beforeEach } from 'node:test';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { PayoutRouter } from '../src/payout/PayoutRouter.js';
import { PayoutStore } from '../src/payout/PayoutStore.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

const EVM_DEV  = '0x1111111111111111111111111111111111111111';
const EVM_USER = '0x2222222222222222222222222222222222222222';
const EVM_BAD  = '0xnot-an-address';

/** Build a router whose store writes to a unique temp directory */
async function makeRouter(config = {}) {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chimera-payout-'));
  const router = new PayoutRouter({ ...config, dataDir: tmpDir });
  return { router, tmpDir };
}

async function cleanup(tmpDir) {
  await fs.rm(tmpDir, { recursive: true, force: true });
}

// ── App Registration ──────────────────────────────────────────────────────────

describe('PayoutRouter — app registration', () => {
  let router, tmpDir;
  before(async () => { ({ router, tmpDir } = await makeRouter()); });
  after(async () => cleanup(tmpDir));

  it('registers a valid app', async () => {
    const r = await router.registerApp({ appId: 'app-1', name: 'Test App', developerEVM: EVM_DEV, feePercent: 0.25 });
    assert.equal(r.success, true);
    assert.equal(r.app.appId, 'app-1');
    assert.equal(r.app.developerEVM, EVM_DEV.toLowerCase());
    assert.equal(r.app.feePercent, 0.25);
  });

  it('rejects missing appId', async () => {
    const r = await router.registerApp({ name: 'No ID', developerEVM: EVM_DEV });
    assert.equal(r.success, false);
  });

  it('rejects invalid EVM address', async () => {
    const r = await router.registerApp({ appId: 'app-bad', developerEVM: EVM_BAD });
    assert.equal(r.success, false);
    assert.ok(r.error.includes('EVM address'));
  });

  it('rejects feePercent > 1', async () => {
    const r = await router.registerApp({ appId: 'app-fee', developerEVM: EVM_DEV, feePercent: 1.5 });
    assert.equal(r.success, false);
  });

  it('defaults feePercent to 0.30 when omitted', async () => {
    const r = await router.registerApp({ appId: 'app-default', developerEVM: EVM_DEV });
    assert.equal(r.success, true);
    assert.equal(r.app.feePercent, 0.30);
  });

  it('retrieves the registered app via getApp', async () => {
    const r = await router.getApp('app-1');
    assert.equal(r.success, true);
    assert.equal(r.app.name, 'Test App');
  });

  it('returns error for unknown appId', async () => {
    const r = await router.getApp('does-not-exist');
    assert.equal(r.success, false);
  });
});

// ── User Registration ─────────────────────────────────────────────────────────

describe('PayoutRouter — user registration', () => {
  let router, tmpDir;
  before(async () => {
    ({ router, tmpDir } = await makeRouter());
    await router.registerApp({ appId: 'app-1', developerEVM: EVM_DEV });
  });
  after(async () => cleanup(tmpDir));

  it('registers a valid user', async () => {
    const r = await router.registerUser({ userId: 'u-1', machineOwnerEVM: EVM_USER, appId: 'app-1' });
    assert.equal(r.success, true);
    assert.equal(r.user.machineOwnerEVM, EVM_USER.toLowerCase());
  });

  it('rejects missing fields', async () => {
    const r = await router.registerUser({ userId: 'u-2', appId: 'app-1' });
    assert.equal(r.success, false);
  });

  it('rejects invalid EVM address', async () => {
    const r = await router.registerUser({ userId: 'u-3', machineOwnerEVM: EVM_BAD, appId: 'app-1' });
    assert.equal(r.success, false);
  });

  it('rejects unknown appId', async () => {
    const r = await router.registerUser({ userId: 'u-4', machineOwnerEVM: EVM_USER, appId: 'no-such-app' });
    assert.equal(r.success, false);
  });

  it('increments app userCount on registration', async () => {
    const before = (await router.getApp('app-1')).app.userCount;
    await router.registerUser({ userId: 'u-5', machineOwnerEVM: EVM_USER, appId: 'app-1' });
    const after = (await router.getApp('app-1')).app.userCount;
    assert.equal(after, before + 1);
  });
});

// ── Order Recording ───────────────────────────────────────────────────────────

describe('PayoutRouter — order recording', () => {
  let router, tmpDir;
  before(async () => {
    ({ router, tmpDir } = await makeRouter());
    await router.registerApp({ appId: 'app-1', developerEVM: EVM_DEV });
    await router.registerUser({ userId: 'u-1', machineOwnerEVM: EVM_USER, appId: 'app-1' });
  });
  after(async () => cleanup(tmpDir));

  it('records a valid order', async () => {
    const r = await router.recordOrder({ orderId: 'ord-1', userId: 'u-1', appId: 'app-1', miner: 'casper', amount: 1.5 });
    assert.equal(r.success, true);
    assert.equal(r.order.amount, 1.5);
    assert.equal(r.order.miner, 'casper');
  });

  it('rejects amount <= 0', async () => {
    const r = await router.recordOrder({ orderId: 'ord-2', userId: 'u-1', appId: 'app-1', miner: 'btfs', amount: 0 });
    assert.equal(r.success, false);
  });

  it('rejects missing fields', async () => {
    const r = await router.recordOrder({ orderId: 'ord-3', userId: 'u-1', appId: 'app-1' });
    assert.equal(r.success, false);
  });

  it('rejects unknown userId', async () => {
    const r = await router.recordOrder({ orderId: 'ord-4', userId: 'ghost', appId: 'app-1', miner: 'golem', amount: 1 });
    assert.equal(r.success, false);
  });

  it('rejects unknown appId', async () => {
    const r = await router.recordOrder({ orderId: 'ord-5', userId: 'u-1', appId: 'ghost', miner: 'casper', amount: 1 });
    assert.equal(r.success, false);
  });

  it('updates user totalEarned aggregate', async () => {
    const before = (await router.getUsers()).users.find(u => u.userId === 'u-1').totalEarned;
    await router.recordOrder({ orderId: 'ord-agg', userId: 'u-1', appId: 'app-1', miner: 'casper', amount: 2 });
    const after = (await router.getUsers()).users.find(u => u.userId === 'u-1').totalEarned;
    assert.ok(after > before);
  });

  it('filters orders by month', async () => {
    const year = new Date().getUTCFullYear();
    const month = new Date().getUTCMonth() + 1;
    const r = await router.getOrders({ year, month });
    assert.ok(r.orders.length > 0);
    assert.ok(r.orders.every(o => o.year === year && o.month === month));
  });
});

// ── Monthly Payout Calculation ────────────────────────────────────────────────

describe('PayoutRouter — calculateMonthlyPayout', () => {
  let router, tmpDir;
  const year = 2025;
  const month = 6;

  before(async () => {
    ({ router, tmpDir } = await makeRouter());
    await router.registerApp({ appId: 'app-1', developerEVM: EVM_DEV, feePercent: 0.30 });
    await router.registerUser({ userId: 'u-1', machineOwnerEVM: EVM_USER, appId: 'app-1' });

    // Manually backdate orders to the target month
    const orders = await router.store.getOrders();
    orders['ord-m1'] = { orderId: 'ord-m1', userId: 'u-1', appId: 'app-1', miner: 'casper', amount: 10, year, month, timestamp: Date.now() };
    orders['ord-m2'] = { orderId: 'ord-m2', userId: 'u-1', appId: 'app-1', miner: 'golem', amount: 20, year, month, timestamp: Date.now() };
    await router.store.saveOrders();
  });
  after(async () => cleanup(tmpDir));

  it('calculates correct totals and split', async () => {
    const r = await router.calculateMonthlyPayout(year, month);
    assert.equal(r.success, true);
    assert.equal(r.manifest.totalOrders, 2);
    assert.equal(r.manifest.totalRevenue, 30);

    const dist = r.manifest.distributions[0];
    assert.equal(dist.totalAmount, 30);
    assert.ok(Math.abs(dist.devAmount - 9) < 0.0001);    // 30 * 0.30
    assert.ok(Math.abs(dist.userAmount - 21) < 0.0001);  // 30 * 0.70
    assert.equal(dist.machineOwnerEVM, EVM_USER.toLowerCase());
    assert.equal(dist.developerEVM, EVM_DEV.toLowerCase());
  });

  it('persists manifest and retrieves it', async () => {
    const r = await router.getPayoutManifest(year, month);
    assert.equal(r.success, true);
    assert.equal(r.manifest.totalOrders, 2);
  });

  it('returns error for month with no manifest', async () => {
    const r = await router.getPayoutManifest(1999, 1);
    assert.equal(r.success, false);
  });
});

// ── Distribution ─────────────────────────────────────────────────────────────

describe('PayoutRouter — distribution lifecycle', () => {
  let router, tmpDir;
  const year = 2025;
  const month = 7;

  before(async () => {
    ({ router, tmpDir } = await makeRouter({ rpcUrl: 'https://arb1.arbitrum.io/rpc' }));
    await router.registerApp({ appId: 'app-1', developerEVM: EVM_DEV, feePercent: 0.30 });
    await router.registerUser({ userId: 'u-1', machineOwnerEVM: EVM_USER, appId: 'app-1' });
    const orders = await router.store.getOrders();
    orders['ord-d1'] = { orderId: 'ord-d1', userId: 'u-1', appId: 'app-1', miner: 'golem', amount: 5, year, month, timestamp: Date.now() };
    await router.store.saveOrders();
    await router.calculateMonthlyPayout(year, month);
    await router.markDistributed(year, month, null);
  });
  after(async () => cleanup(tmpDir));

  it('markDistributed creates a distribution record with status calculated', async () => {
    const r = await router.getDistributionStatus(year, month);
    assert.equal(r.success, true);
    assert.equal(r.distribution.status, 'calculated');
  });

  it('executeDistribution fails cleanly when PAYOUT_SIGNING_KEY is absent', async () => {
    delete process.env.PAYOUT_SIGNING_KEY;
    const r = await router.executeDistribution(year, month);
    assert.equal(r.success, false);
    assert.ok(r.error.includes('PAYOUT_SIGNING_KEY'));
    const status = await router.getDistributionStatus(year, month);
    assert.equal(status.distribution.status, 'failed');
  });

  it('executeDistribution returns the full recipient plan even on key-missing failure', async () => {
    // Reset to calculated so we can try again
    const dists = await router.store.getDistributions();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    dists[key].status = 'calculated';
    await router.store.saveDistributions();

    delete process.env.PAYOUT_SIGNING_KEY;
    const r = await router.executeDistribution(year, month);
    assert.equal(r.success, false);
    assert.ok(Array.isArray(r.plan));
    assert.ok(r.plan.length > 0);
    assert.ok(r.plan.every(p => /^0x[a-fA-F0-9]{40}$/.test(p.address)));
    assert.ok(r.plan.every(p => p.amount > 0));
  });

  it('denyDistribution sets status to denied', async () => {
    const dists = await router.store.getDistributions();
    const key = `${year}-${String(month).padStart(2, '0')}`;
    dists[key].status = 'calculated';
    dists[key].generatedAt = Date.now();
    await router.store.saveDistributions();

    const r = await router.denyDistribution(year, month, { memberId: 'admin', reason: 'audit required' });
    assert.equal(r.success, true);
    assert.equal(r.distribution.status, 'denied');
    assert.equal(r.distribution.denials[0].memberId, 'admin');
  });

  it('confirmDistribution after manual tx sets status to confirmed with txHash', async () => {
    const fakeTx = '0xabc123def456789012345678901234567890123456789012345678901234567890';
    const r = await router.confirmDistribution(year, month, fakeTx);
    assert.equal(r.success, true);
    assert.equal(r.distribution.status, 'confirmed');
    assert.equal(r.distribution.txHash, fakeTx);
  });

  it('executeDistribution refuses to re-execute a confirmed distribution', async () => {
    const r = await router.executeDistribution(year, month);
    assert.equal(r.success, false);
    assert.ok(r.error.includes('confirmed'));
  });
});

// ── PayoutRouter stats ────────────────────────────────────────────────────────

describe('PayoutRouter — getStats', () => {
  let router, tmpDir;
  before(async () => {
    ({ router, tmpDir } = await makeRouter());
    await router.registerApp({ appId: 'app-s', developerEVM: EVM_DEV, feePercent: 0.20 });
    await router.registerUser({ userId: 'u-s', machineOwnerEVM: EVM_USER, appId: 'app-s' });
    await router.recordOrder({ orderId: 'ord-s1', userId: 'u-s', appId: 'app-s', miner: 'btfs', amount: 7 });
  });
  after(async () => cleanup(tmpDir));

  it('returns correct aggregate stats', async () => {
    const r = await router.getStats();
    assert.equal(r.success, true);
    assert.equal(r.stats.appsRegistered, 1);
    assert.equal(r.stats.usersRegistered, 1);
    assert.equal(r.stats.totalOrders, 1);
    assert.equal(r.stats.totalRevenue, 7);
  });
});
